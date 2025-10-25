import os
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, constr
from sqlalchemy import create_engine, text, engine as sqlalchemy_engine
import firebase_admin
from firebase_admin import credentials, auth
from firebase_admin.exceptions import FirebaseError

# Importar el middleware de CORS
from fastapi.middleware.cors import CORSMiddleware

# --- Configuración de Firebase ---
try:
    # Intenta inicializar usando las credenciales del entorno de Cloud Run
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)
    print("✅ Firebase Admin SDK inicializado.")
except ValueError as e:
    # Maneja el caso común donde ya está inicializado (ej. en re-despliegues rápidos)
    if "The default Firebase app already exists" in str(e):
        print("🟡 Firebase Admin SDK ya estaba inicializado.")
    else:
        print(f"❌ Error al inicializar Firebase Admin: {e}")
        # Considerar si fallar aquí es apropiado dependiendo de la severidad
except Exception as e:
    print(f"❌ Error inesperado al inicializar Firebase Admin: {e}")


# --- Configuración de la Base de Datos ---
PROJECT_ID = "composed-apogee-475623-p6" # ID de proyecto corregido y hardcodeado
REGION = "southamerica-west1"
INSTANCE_NAME = "vigilia-db-main"
DB_USER = "postgres"
DB_PASS = os.environ.get("DB_PASS", "") # Leído de Secret Manager
DB_NAME = "postgres"

# --- Conexión vía Socket Unix (Método Recomendado para Cloud Run) ---
db_socket_dir = os.environ.get("DB_SOCKET_DIR", "/cloudsql")
cloud_sql_connection_name = f"{PROJECT_ID}:{REGION}:{INSTANCE_NAME}"

db_url = sqlalchemy_engine.URL.create(
    drivername="postgresql+psycopg2", # Usando el driver psycopg2
    username=DB_USER,
    password=DB_PASS,
    database=DB_NAME,
    query={
        "host": f"{db_socket_dir}/{cloud_sql_connection_name}" # Ruta al socket Unix
    }
)

# Creamos el engine directamente con la URL y configuraciones de pool
engine = create_engine(
    db_url,
    pool_size=5, # Número de conexiones a mantener abiertas
    max_overflow=2, # Conexiones adicionales permitidas bajo carga
    pool_timeout=30, # Segundos para esperar por una conexión
    pool_recycle=1800 # Segundos antes de reciclar una conexión inactiva (30 mins)
)
# --- FIN DE CONFIGURACIÓN DE BASE DE DATOS ---

# Inicializa FastAPI
app = FastAPI(title="VigilIA API")

# --- Configuración de CORS ---
origins = [
    "http://localhost",
    "http://localhost:8081", # Puerto común para Expo Web
    "http://localhost:8080", # Otro puerto común
    "http://localhost:19006", # Puerto web de Expo más antiguo
    # Añade aquí la URL de tu frontend desplegado en producción
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, # Orígenes permitidos
    allow_credentials=True, # Permitir credenciales (cookies, auth headers)
    allow_methods=["*"], # Permitir todos los métodos (GET, POST, PUT, etc.)
    allow_headers=["*"], # Permitir todas las cabeceras
)
# --- FIN DE CONFIGURACIÓN DE CORS ---

# --- Modelos de Datos (Pydantic) ---
class UserCreate(BaseModel):
    nombre: constr(min_length=1)
    email: EmailStr
    password: constr(min_length=6)
    # Opcional: Para permitir elegir rol en el registro
    rol: str = 'cuidador' # Por defecto 'cuidador'

class UserInfo(BaseModel): # Respuesta para /register
    uid: str
    email: str
    nombre: str

class CurrentUserInfo(BaseModel): # Respuesta para /usuarios/yo
    id: int # El ID de tu tabla 'usuarios'
    firebase_uid: str
    email: str
    nombre: str
    rol: str # MUY IMPORTANTE: Devolvemos el rol

class AlertConfigUpdate(BaseModel):
    notificar_app: bool | None = None
    token_fcm_app: str | None = None
    notificar_whatsapp: bool | None = None
    numero_whatsapp: constr(max_length=25) | None = None
    notificar_email: bool | None = None
    email_secundario: constr(max_length=100) | None = None

# --- Seguridad y Autenticación ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token") # tokenUrl es nominal

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Dependencia FastAPI: Verifica el token ID de Firebase y devuelve
    el payload decodificado (incluye uid, email, etc.).
    Si el token es inválido o expirado, lanza HTTPException 401.
    """
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except ValueError as e: # Captura errores específicos de token inválido
        print(f"Error de verificación de token (Value Error): {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except auth.InvalidIdTokenError as e: # Token malformado o firma incorrecta
        print(f"Error de verificación de token (InvalidIdTokenError): {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o malformado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except auth.ExpiredIdTokenError as e: # Token expirado
        print(f"Error de verificación de token (ExpiredIdTokenError): {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e: # Captura cualquier otro error durante la verificación
        print(f"Error inesperado durante verificación de token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se pudo validar la autenticación.",
            headers={"WWW-Authenticate": "Bearer"},
        )
# --- FIN DE SEGURIDAD Y AUTENTICACIÓN ---

# --- Endpoints de la API ---

# --- ENDPOINT: / (Raíz, público) ---
@app.get("/")
def read_root():
    """Endpoint raíz para verificar que la API está en línea."""
    return {"status": "VigilIA API está en línea"}

# --- ENDPOINT: /register (Público) ---
@app.post("/register", response_model=UserInfo, status_code=status.HTTP_201_CREATED)
def register_user(user: UserCreate):
    """
    Registra un nuevo usuario:
    1. Crea el usuario en Firebase Authentication.
    2. Crea el registro correspondiente en la tabla 'usuarios' de PostgreSQL.
    3. Crea el registro por defecto en 'configuraciones_alerta' si es cuidador/admin.
    """
    fb_user = None # Inicializa para manejo de errores
    
    # Validar el rol recibido (si se envía)
    allowed_roles = ['cuidador', 'adulto_mayor'] # Excluimos 'administrador' del registro público
    if user.rol not in allowed_roles:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Rol inválido. Roles permitidos: {', '.join(allowed_roles)}")

    try:
        # 1. Crear usuario en Firebase
        print(f"Intentando crear usuario en Firebase para: {user.email} con rol: {user.rol}")
        fb_user = auth.create_user(
            email=user.email,
            password=user.password,
            display_name=user.nombre
        )
        print(f"✅ Usuario creado en Firebase con UID: {fb_user.uid}")

        # 2. Intentar conectar y escribir en la BD
        print("Intentando conectar a la BD...")
        with engine.connect() as db_conn:
            print("✅ Conexión a la BD establecida.")
            trans = db_conn.begin() # Iniciar transacción
            try:
                # 2a. Insertar en tabla 'usuarios' con el rol especificado
                print(f"Insertando usuario en tabla 'usuarios' con UID: {fb_user.uid} y Rol: {user.rol}")
                query_user = text("""
                    INSERT INTO usuarios (nombre, email, hash_contrasena, firebase_uid, rol) 
                    VALUES (:nombre, :email, :hash, :uid, :rol)
                    RETURNING id
                """)
                user_result = db_conn.execute(query_user, {
                    "nombre": user.nombre,
                    "email": user.email,
                    "hash": "firebase_managed", # Placeholder
                    "uid": fb_user.uid,
                    "rol": user.rol # Usamos el rol recibido/default
                }).fetchone()

                if not user_result or user_result[0] is None:
                    raise Exception("No se pudo crear el usuario en la BD (INSERT usuarios no devolvió ID).")

                new_user_id = user_result[0]
                print(f"✅ Usuario insertado en tabla 'usuarios' con ID: {new_user_id}")

                # 2b. Insertar config por defecto SOLO si es cuidador (o admin en el futuro)
                if user.rol == 'cuidador': # o user.rol == 'administrador'
                    print(f"Insertando config por defecto para usuario_id: {new_user_id}")
                    query_config = text("INSERT INTO configuraciones_alerta (usuario_id) VALUES (:id)")
                    db_conn.execute(query_config, {"id": new_user_id})
                    print(f"✅ Configuración por defecto insertada.")
                else:
                    print(f"ℹ️ No se inserta config por defecto para rol: {user.rol}")

                # 2c. Confirmar transacción
                trans.commit()
                print(f"✅ Transacción de BD confirmada.")

            except Exception as e_db:
                # Si algo falla en la BD, hacer rollback e imprimir error detallado
                print("--- ERROR DURANTE TRANSACCIÓN DE BD ---")
                print(f"ERROR: {str(e_db)}")
                print(f"TIPO DE ERROR: {type(e_db)}")
                trans.rollback()
                print("--- ROLLBACK DE BD REALIZADO ---")

                # Intentar eliminar usuario de Firebase para consistencia
                try:
                    print(f"Iniciando rollback de Firebase para {fb_user.uid}...")
                    auth.delete_user(fb_user.uid)
                    print(f"✅ Usuario {fb_user.uid} eliminado de Firebase por rollback.")
                except Exception as e_fb_delete:
                    print(f"--- ERROR CRÍTICO DURANTE ROLLBACK DE FIREBASE ---")
                    print(f"ERROR: {str(e_fb_delete)}")

                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                    detail=f"Error al registrar en la base de datos: {str(e_db)}")

        # Si todo salió bien
        return UserInfo(uid=fb_user.uid, email=fb_user.email, nombre=fb_user.display_name)

    except FirebaseError as e:
        # Manejar errores específicos de Firebase
        error_code = e.code
        print(f"--- ERROR DE FIREBASE ---")
        print(f"CÓDIGO: {error_code}, MENSAJE: {e}")
        if error_code == 'EMAIL_EXISTS':
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El correo electrónico ya está en uso.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error de Firebase al crear usuario: {e}")

    except Exception as e:
        # Capturar cualquier otro error inesperado
        print("--- ERROR INESPERADO (GENERAL) ---")
        print(f"ERROR: {str(e)}")
        print(f"TIPO DE ERROR: {type(e)}")

        # Si el usuario se creó en Firebase pero falló antes/durante la BD
        if fb_user and fb_user.uid:
            try:
                print(f"Rollback de Firebase (general) para {fb_user.uid}...")
                auth.delete_user(fb_user.uid)
                print(f"✅ Usuario {fb_user.uid} eliminado de Firebase.")
            except Exception as e_fb_delete:
                print(f"--- ERROR CRÍTICO DURANTE ROLLBACK (GENERAL) ---")
                print(f"ERROR: {str(e_fb_delete)}")

        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error inesperado durante el registro: {str(e)}")

# --- ENDPOINT: /usuarios/yo (Protegido) ---
@app.get("/usuarios/yo", response_model=CurrentUserInfo)
def read_users_me(current_user: dict = Depends(get_current_user)):
    """
    Obtiene la información (incluyendo rol) del usuario actualmente 
    autenticado desde la tabla 'usuarios' en PostgreSQL.
    """
    user_uid = current_user.get("uid") 
    if not user_uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido, UID no encontrado.")
        
    print(f"Buscando perfil para firebase_uid: {user_uid}")
    try:
        with engine.connect() as db_conn:
            query = text("""
                SELECT id, firebase_uid, email, nombre, rol 
                FROM usuarios 
                WHERE firebase_uid = :uid
            """)
            result = db_conn.execute(query, {"uid": user_uid}).fetchone()
            
            if not result:
                print(f"❌ Usuario con firebase_uid {user_uid} no encontrado en la BD local.")
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado en la base de datos local.")
            
            print(f"✅ Perfil encontrado para {user_uid}, rol: {result._mapping['rol']}")
            return CurrentUserInfo(**result._mapping) 
            
    except HTTPException as http_exc:
         raise http_exc # Relanzar excepciones HTTP conocidas
    except Exception as e:
        print(f"--- ERROR AL OBTENER USUARIO /usuarios/yo ---")
        print(f"ERROR: {str(e)}")
        print(f"TIPO: {type(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al obtener datos del usuario: {str(e)}")

# --- ENDPOINT: /configuracion/ (GET, Protegido) ---
@app.get("/configuracion/", 
         # response_model=AlertConfigUpdate # Podríamos definir un modelo de respuesta si quisiéramos
        ) 
def get_alert_configuration(current_user: dict = Depends(get_current_user)):
    """
    Obtiene la configuración de alertas para el usuario (cuidador/admin) autenticado.
    Verifica que el usuario tenga el rol permitido ('cuidador' o 'administrador').
    """
    user_uid = current_user.get("uid")
    # Primero, obtenemos el rol desde nuestra BD para verificar permiso
    user_info = read_users_me(current_user) # Reutilizamos la función anterior
    
    if user_info.rol not in ['cuidador', 'administrador']:
        print(f"Acceso denegado a /configuracion/ para usuario {user_uid} con rol {user_info.rol}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso no permitido para este rol de usuario.")

    print(f"Obteniendo configuración para usuario_id: {user_info.id} (firebase_uid: {user_uid})")
    try:
        with engine.connect() as db_conn:
            # Buscamos la configuración usando el ID interno del usuario
            query = text("""
                SELECT * FROM configuraciones_alerta 
                WHERE usuario_id = :id
            """)
            result = db_conn.execute(query, {"id": user_info.id}).fetchone()
            
            if not result:
                 # Esto podría pasar si el registro falló parcialmente antes
                print(f"❌ Configuración no encontrada para usuario_id {user_info.id}. ¿Registro incompleto?")
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Configuración de alerta no encontrada para el usuario.")
            
            print(f"✅ Configuración encontrada para usuario_id: {user_info.id}")
            return dict(result._mapping) # Devolvemos como diccionario
            
    except HTTPException as http_exc:
         raise http_exc
    except Exception as e:
        print(f"--- ERROR AL OBTENER /configuracion/ ---")
        print(f"ERROR: {str(e)}")
        print(f"TIPO: {type(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en la base de datos al obtener configuración: {str(e)}")

# --- ENDPOINT: /configuracion/ (PUT, Protegido) ---
@app.put("/configuracion/",
         # response_model=AlertConfigUpdate # Podríamos definir un modelo de respuesta
        )
def update_alert_configuration(config: AlertConfigUpdate, current_user: dict = Depends(get_current_user)):
    """
    Actualiza la configuración de alertas para el usuario (cuidador/admin) autenticado.
    Verifica que el usuario tenga el rol permitido.
    """
    user_uid = current_user.get("uid")
    # Obtenemos info y rol del usuario
    user_info = read_users_me(current_user) 
    
    if user_info.rol not in ['cuidador', 'administrador']:
        print(f"Acceso denegado a PUT /configuracion/ para usuario {user_uid} con rol {user_info.rol}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso no permitido para este rol de usuario.")
    
    # Prepara los campos a actualizar
    update_fields = config.model_dump(exclude_unset=True) # Solo actualiza campos enviados
    if not update_fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No hay campos para actualizar")

    # Construye la parte SET de la consulta SQL dinámicamente
    set_clause = ", ".join([f"{key} = :{key}" for key in update_fields.keys()])
    # Añade el usuario_id para el WHERE clause
    update_fields["usuario_id"] = user_info.id
    
    query = text(f"""
        UPDATE configuraciones_alerta 
        SET {set_clause}, ultima_modificacion = NOW()
        WHERE usuario_id = :usuario_id
        RETURNING * """)

    print(f"Actualizando configuración para usuario_id: {user_info.id} con campos: {list(update_fields.keys())}")
    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            result = db_conn.execute(query, update_fields).fetchone()
            trans.commit()
            if not result:
                # Si no se encontró la fila para actualizar
                print(f"❌ Configuración no encontrada para actualizar (usuario_id {user_info.id}).")
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Configuración no encontrada para el usuario.")
            
            print(f"✅ Configuración actualizada para usuario_id: {user_info.id}")
            return dict(result._mapping)
            
    except HTTPException as http_exc:
         raise http_exc
    except Exception as e:
        print(f"--- ERROR AL ACTUALIZAR /configuracion/ ---")
        print(f"ERROR: {str(e)}")
        print(f"TIPO: {type(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al actualizar en la base de datos: {str(e)}")

# --- FIN DE ENDPOINTS ---