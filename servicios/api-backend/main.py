import os
from fastapi import FastAPI, HTTPException, Depends, status, Header
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, constr, validator
from sqlalchemy import create_engine, text, engine as sqlalchemy_engine
import json
import firebase_admin
from firebase_admin import credentials, auth
from firebase_admin.exceptions import FirebaseError
from datetime import datetime
from fastapi.middleware.cors import CORSMiddleware

# --- Configuración de Firebase ---
try:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)
    print("✅ Firebase Admin SDK inicializado.")
except ValueError as e:
    if "The default Firebase app already exists" in str(e):
        print("🟡 Firebase Admin SDK ya estaba inicializado.")
    else:
        print(f"❌ Error al inicializar Firebase Admin: {e}")
except Exception as e:
    print(f"❌ Error inesperado al inicializar Firebase Admin: {e}")


# --- Configuración de la Base de Datos ---
PROJECT_ID = "composed-apogee-475623-p6"
REGION = "southamerica-west1"
INSTANCE_NAME = "vigilia-db-main"
DB_USER = "postgres"
DB_PASS = os.environ.get("DB_PASS", "") 
DB_NAME = "postgres"

db_socket_dir = os.environ.get("DB_SOCKET_DIR", "/cloudsql")
cloud_sql_connection_name = f"{PROJECT_ID}:{REGION}:{INSTANCE_NAME}"

db_url = sqlalchemy_engine.URL.create(
    drivername="postgresql+psycopg2",
    username=DB_USER,
    password=DB_PASS,
    database=DB_NAME,
    query={
        "host": f"{db_socket_dir}/{cloud_sql_connection_name}"
    }
)

engine = create_engine(
    db_url,
    pool_size=5,
    max_overflow=2,
    pool_timeout=30,
    pool_recycle=1800
)
# --- FIN DE CONFIGURACIÓN DE BASE DE DATOS ---

app = FastAPI(title="VigilIA API")
print("✅✅✅ API V2 (CON CORRECCIÓN DIAS_SEMANA) INICIADA ✅✅✅")

# --- Configuración de CORS ---
origins = [
    "http://localhost",
    "http://localhost:8081",
    "http://localhost:8080",
    "http://localhost:19006",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --- FIN DE CONFIGURACIÓN DE CORS ---

# --- Modelos de Datos (Pydantic) ---
class UserCreate(BaseModel):
    nombre: constr(min_length=1)
    email: EmailStr
    password: constr(min_length=6)
    rol: str = 'cuidador'

class UserInfo(BaseModel):
    uid: str
    email: str
    nombre: str

class CurrentUserInfo(BaseModel):
    id: int
    firebase_uid: str
    email: str
    nombre: str
    rol: str

class UserUpdate(BaseModel):
    nombre: constr(min_length=1, max_length=100) | None = None

class AlertConfigUpdate(BaseModel):
    notificar_app: bool | None = None
    token_fcm_app: str | None = None
    notificar_whatsapp: bool | None = None
    numero_whatsapp: constr(max_length=25) | None = None
    notificar_email: bool | None = None
    email_secundario: constr(max_length=100) | None = None

class EventoCaidaInfo(BaseModel):
    id: int
    adulto_mayor_id: int
    dispositivo_id: int | None = None
    timestamp_alerta: datetime
    url_video_almacenado: str | None = None
    confirmado_por_cuidador: bool | None = None
    notas: str | None = None
    detalles_adicionales: dict | None = None
    nombre_dispositivo: str | None = None
    nombre_adulto_mayor: str | None = None

class RecordatorioCreate(BaseModel):
    adulto_mayor_id: int
    titulo: constr(min_length=1, max_length=150)
    descripcion: str | None = None
    fecha_hora_programada: datetime
    frecuencia: str = 'una_vez'
    tipo_recordatorio: str = 'medicamento'
    dias_semana: list[int] | None = None

    @validator('frecuencia')
    def frecuencia_valida(cls, v):
        allowed = ['una_vez', 'diario', 'semanal', 'mensual']
        if v not in allowed:
            raise ValueError(f'Frecuencia debe ser una de: {", ".join(allowed)}')
        return v

    @validator('tipo_recordatorio')
    def tipo_valido(cls, v):
        allowed = ['medicamento', 'cita_medica', 'ejercicio', 'hidratacion', 'comida', 'consejo_salud', 'otro']
        if v not in allowed:
            raise ValueError(f'Tipo de recordatorio debe ser uno de: {", ".join(allowed)}')
        return v

    @validator('dias_semana')
    def dias_semana_validos(cls, v):
        if v is None:
            return [] 
        if not isinstance(v, list):
            raise ValueError('dias_semana debe ser una lista de enteros')
        if len(v) == 0:
            return []
        for dia in v:
            if not isinstance(dia, int) or dia < 0 or dia > 6:
                raise ValueError('Cada día debe ser un número entre 0 (Domingo) y 6 (Sábado)')
        return sorted(list(set(v)))

class RecordatorioUpdate(BaseModel):
    titulo: constr(min_length=1, max_length=150) | None = None
    descripcion: str | None = None
    fecha_hora_programada: datetime | None = None
    frecuencia: str | None = None
    estado: str | None = None
    tipo_recordatorio: str | None = None
    dias_semana: list[int] | None = None

    @validator('frecuencia')
    def frecuencia_valida_update(cls, v):
        if v is None:
            return v
        allowed = ['una_vez', 'diario', 'semanal', 'mensual']
        if v not in allowed:
            raise ValueError(f'Frecuencia debe ser una de: {", ".join(allowed)}')
        return v

    @validator('estado')
    def estado_valido_update(cls, v):
        if v is None:
            return v
        allowed = ['pendiente', 'enviado', 'confirmado', 'omitido']
        if v not in allowed:
            raise ValueError(f'Estado debe ser uno de: {", ".join(allowed)}')
        return v

    @validator('tipo_recordatorio')
    def tipo_valido_update(cls, v):
        if v is None:
            return v
        allowed = ['medicamento', 'cita_medica', 'ejercicio', 'hidratacion', 'comida', 'consejo_salud', 'otro']
        if v not in allowed:
            raise ValueError(f'Tipo de recordatorio debe ser uno de: {", ".join(allowed)}')
        return v

    @validator('dias_semana')
    def dias_semana_validos_update(cls, v):
        if v is None:
            return []
        if not isinstance(v, list):
            raise ValueError('dias_semana debe ser una lista de enteros')
        if len(v) == 0:
            return []
        for dia in v:
            if not isinstance(dia, int) or dia < 0 or dia > 6:
                raise ValueError('Cada día debe ser un número entre 0 (Domingo) y 6 (Sábado)')
        return sorted(list(set(v)))

class RecordatorioInfo(BaseModel):
    id: int
    adulto_mayor_id: int
    titulo: str
    descripcion: str | None
    fecha_hora_programada: datetime
    frecuencia: str
    estado: str
    tipo_recordatorio: str | None = 'medicamento'
    dias_semana: list[int] | None = None
    fecha_creacion: datetime
    nombre_adulto_mayor: str | None = None

# --- INICIO: NUEVO MODELO PARA EL ENDPOINT DE CAÍDAS ---
class CaidaDetectada(BaseModel):
    dispositivo_id: int
    timestamp_caida: datetime
    url_video_almacenado: str
# --- FIN: NUEVO MODELO ---

class SolicitudCuidadoCreate(BaseModel):
    email_destinatario: EmailStr
    mensaje: str | None = None

class SolicitudCuidadoInfo(BaseModel):
    id: int
    cuidador_id: int
    email_destinatario: str
    usuario_destinatario_id: int | None
    estado: str
    mensaje: str | None
    fecha_solicitud: datetime
    fecha_respuesta: datetime | None
    nombre_cuidador: str | None = None
    email_cuidador: str | None = None

class AdultoMayorCreate(BaseModel):
    nombre_completo: constr(min_length=1, max_length=150)
    fecha_nacimiento: datetime | None = None
    direccion: str | None = None
    notas_relevantes: str | None = None

class AdultoMayorUpdate(BaseModel):
    nombre_completo: constr(min_length=1, max_length=150) | None = None
    fecha_nacimiento: datetime | None = None
    direccion: str | None = None
    notas_relevantes: str | None = None

class AdultoMayorInfo(BaseModel):
    id: int
    usuario_id: int | None
    nombre_completo: str
    fecha_nacimiento: datetime | None
    direccion: str | None
    notas_relevantes: str | None
    token_fcm_app_adulto: str | None
    fecha_registro: datetime

class AlertaCreate(BaseModel):
    adulto_mayor_id: int
    tipo_alerta: str = 'ayuda'  # 'ayuda' o 'caida'
    dispositivo_id: int | None = None  # Solo para caídas
    url_video_almacenado: str | None = None  # Solo para caídas
    detalles_adicionales: dict | None = None  # JSONB con info adicional

class AlertaInfo(BaseModel):
    id: int
    adulto_mayor_id: int
    tipo_alerta: str
    timestamp_alerta: datetime
    dispositivo_id: int | None
    url_video_almacenado: str | None
    confirmado_por_cuidador: bool | None
    notas: str | None
    detalles_adicionales: dict | None
    fecha_registro: datetime
    nombre_adulto_mayor: str | None = None

# --- Seguridad y Autenticación ---
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- INICIO: NUEVA DEPENDENCIA DE SEGURIDAD INTERNA ---
# !! IMPORTANTE: Cambia esta clave por una cadena aleatoria y segura.
# Esta clave la guardarás en Secret Manager para AMBOS servicios.
INTERNAL_API_KEY_SECRET_NAME = "INTERNAL_API_KEY" # El nombre del secret en Secret Manager
INTERNAL_API_KEY = os.environ.get(INTERNAL_API_KEY_SECRET_NAME, "CAMBIA_ESTA_CLAVE_SECRETA_POR_DEFECTO")

async def verify_internal_token(x_internal_token: str = Header(None)):
    """Verifica que la llamada provenga de otro servicio tuyo."""
    if not x_internal_token:
         print(f"❌ Acceso interno denegado. Falta X-Internal-Token.")
         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Falta token de autorización interna.")
    
    if x_internal_token != INTERNAL_API_KEY:
        print(f"❌ Intento de acceso interno fallido. Token recibido no coincide.")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso no autorizado.")
    return True
# --- FIN: NUEVA DEPENDENCIA DE SEGURIDAD INTERNA ---

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Verifica el token ID de Firebase y devuelve el payload."""
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except ValueError as e:
        print(f"Error de verificación de token (Value Error): {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except auth.InvalidIdTokenError as e:
        print(f"Error de verificación de token (InvalidIdTokenError): {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o malformado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except auth.ExpiredIdTokenError as e:
        print(f"Error de verificación de token (ExpiredIdTokenError): {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        print(f"Error inesperado durante verificación de token: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se pudo validar la autenticación.",
            headers={"WWW-Authenticate": "Bearer"},
        )
# --- FIN DE SEGURIDAD Y AUTENTICACIÓN ---

# --- Endpoints de la API ---

@app.get("/")
def read_root():
    return {"status": "VigilIA API está en línea"}

@app.post("/register", response_model=UserInfo, status_code=status.HTTP_201_CREATED)
def register_user(user: UserCreate):
    fb_user = None
    allowed_roles = ['cuidador', 'adulto_mayor']
    if user.rol not in allowed_roles:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Rol inválido. Roles permitidos: {', '.join(allowed_roles)}")

    try:
        print(f"Intentando crear usuario en Firebase para: {user.email} con rol: {user.rol}")
        fb_user = auth.create_user(
            email=user.email,
            password=user.password,
            display_name=user.nombre
        )
        print(f"✅ Usuario creado en Firebase con UID: {fb_user.uid}")

        print("Intentando conectar a la BD...")
        with engine.connect() as db_conn:
            print("✅ Conexión a la BD establecida.")
            trans = db_conn.begin()
            try:
                print(f"Insertando usuario en tabla 'usuarios' con UID: {fb_user.uid} y Rol: {user.rol}")
                query_user = text("""
                    INSERT INTO usuarios (nombre, email, hash_contrasena, firebase_uid, rol) 
                    VALUES (:nombre, :email, :hash, :uid, :rol)
                    RETURNING id
                """)
                user_result = db_conn.execute(query_user, {
                    "nombre": user.nombre,
                    "email": user.email,
                    "hash": "firebase_managed",
                    "uid": fb_user.uid,
                    "rol": user.rol
                }).fetchone()

                if not user_result or user_result[0] is None:
                    raise Exception("No se pudo crear el usuario en la BD (INSERT usuarios no devolvió ID).")

                new_user_id = user_result[0]
                print(f"✅ Usuario insertado en tabla 'usuarios' con ID: {new_user_id}")

                if user.rol == 'cuidador':
                    print(f"Insertando config por defecto para usuario_id: {new_user_id}")
                    query_config = text("INSERT INTO configuraciones_alerta (usuario_id) VALUES (:id)")
                    db_conn.execute(query_config, {"id": new_user_id})
                    print(f"✅ Configuración por defecto insertada.")
                else:
                    print(f"ℹ️ No se inserta config por defecto para rol: {user.rol}")

                trans.commit()
                print(f"✅ Transacción de BD confirmada.")

            except Exception as e_db:
                print(f"--- ERROR DURANTE TRANSACCIÓN DE BD ---")
                print(f"ERROR: {str(e_db)}")
                trans.rollback()
                print("--- ROLLBACK DE BD REALIZADO ---")

                try:
                    print(f"Iniciando rollback de Firebase para {fb_user.uid}...")
                    auth.delete_user(fb_user.uid)
                    print(f"✅ Usuario {fb_user.uid} eliminado de Firebase por rollback.")
                except Exception as e_fb_delete:
                    print(f"--- ERROR CRÍTICO DURANTE ROLLBACK DE FIREBASE ---")
                    print(f"ERROR: {str(e_fb_delete)}")

                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                                    detail=f"Error al registrar en la base de datos: {str(e_db)}")

        return UserInfo(uid=fb_user.uid, email=fb_user.email, nombre=fb_user.display_name)

    except FirebaseError as e:
        error_code = e.code
        print(f"--- ERROR DE FIREBASE ---")
        print(f"CÓDIGO: {error_code}, MENSAJE: {e}")
        if error_code == 'EMAIL_EXISTS':
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El correo electrónico ya está en uso.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error de Firebase al crear usuario: {e}")

    except Exception as e:
        print(f"--- ERROR INESPERADO (GENERAL) ---")
        print(f"ERROR: {str(e)}")

        if fb_user and fb_user.uid:
            try:
                print(f"Rollback de Firebase (general) para {fb_user.uid}...")
                auth.delete_user(fb_user.uid)
                print(f"✅ Usuario {fb_user.uid} eliminado de Firebase.")
            except Exception as e_fb_delete:
                print(f"--- ERROR CRÍTICO DURANTE ROLLBACK (GENERAL) ---")
                print(f"ERROR: {str(e_fb_delete)}")

        if isinstance(e, HTTPException):
             raise e
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error inesperado durante el registro: {str(e)}")

@app.get("/usuarios/yo", response_model=CurrentUserInfo)
def read_users_me(current_user: dict = Depends(get_current_user)):
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
         raise http_exc
    except Exception as e:
        print(f"--- ERROR AL OBTENER USUARIO /usuarios/yo ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al obtener datos del usuario: {str(e)}")

@app.delete("/usuarios/yo", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_account(current_user: dict = Depends(get_current_user)):
    user_uid = current_user.get("uid")
    user_info = read_users_me(current_user)

    print(f"Intentando eliminar datos locales para usuario_id: {user_info.id} (firebase_uid: {user_uid})")
    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            try:
                query = text("DELETE FROM usuarios WHERE id = :id AND firebase_uid = :uid")
                result = db_conn.execute(query, {"id": user_info.id, "uid": user_uid})

                if result.rowcount == 0:
                    print(f"❌ No se encontró el usuario local {user_info.id} para eliminar.")
                    pass

                trans.commit()
                print(f"✅ Datos locales eliminados para usuario_id: {user_info.id}")

            except Exception as e_db:
                print(f"--- ERROR AL ELIMINAR USUARIO (DB) ---")
                print(f"ERROR: {str(e_db)}")
                trans.rollback()
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD al eliminar usuario: {str(e_db)}")
        return None
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"--- ERROR INESPERADO AL ELIMINAR USUARIO ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error inesperado: {str(e)}")

@app.put("/usuarios/yo", response_model=CurrentUserInfo)
def update_user_profile(update_data: UserUpdate, current_user: dict = Depends(get_current_user)):
    """
    Actualiza el perfil del usuario autenticado (nombre).
    """
    user_uid = current_user.get("uid")
    if not user_uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido, UID no encontrado.")

    # Obtener información actual del usuario
    user_info = read_users_me(current_user)

    # Validar que al menos un campo esté presente
    if update_data.nombre is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Debe proporcionar al menos un campo para actualizar.")

    print(f"Actualizando perfil para usuario_id: {user_info.id} (firebase_uid: {user_uid})")

    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            try:
                # Actualizar nombre en la base de datos
                query = text("""
                    UPDATE usuarios
                    SET nombre = :nombre
                    WHERE id = :id AND firebase_uid = :uid
                """)
                result = db_conn.execute(query, {
                    "nombre": update_data.nombre.strip(),
                    "id": user_info.id,
                    "uid": user_uid
                })

                if result.rowcount == 0:
                    trans.rollback()
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")

                trans.commit()
                print(f"✅ Perfil actualizado para usuario_id: {user_info.id}")

                # Retornar el perfil actualizado
                return read_users_me(current_user)

            except HTTPException as http_exc:
                trans.rollback()
                raise http_exc
            except Exception as e_db:
                print(f"--- ERROR AL ACTUALIZAR USUARIO (DB) ---")
                print(f"ERROR: {str(e_db)}")
                trans.rollback()
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD al actualizar usuario: {str(e_db)}")

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"--- ERROR INESPERADO AL ACTUALIZAR USUARIO ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error inesperado: {str(e)}")

@app.get("/configuracion/") 
def get_alert_configuration(current_user: dict = Depends(get_current_user)):
    user_info = read_users_me(current_user)

    print(f"Obteniendo configuración para usuario_id: {user_info.id} (firebase_uid: {user_info.firebase_uid})")
    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            try:
                query = text("""
                    SELECT * FROM configuraciones_alerta
                    WHERE usuario_id = :id
                """)
                result = db_conn.execute(query, {"id": user_info.id}).fetchone()

                if not result:
                    print(f"⚠️ Configuración no encontrada para usuario_id {user_info.id}. Creando configuración por defecto...")
                    query_create = text("""
                        INSERT INTO configuraciones_alerta (usuario_id)
                        VALUES (:id)
                        RETURNING *
                    """)
                    result = db_conn.execute(query_create, {"id": user_info.id}).fetchone()
                    trans.commit()
                    print(f"✅ Configuración por defecto creada para usuario_id: {user_info.id}")
                else:
                    trans.commit()
                    print(f"✅ Configuración encontrada para usuario_id: {user_info.id}")

                return dict(result._mapping)
            except Exception as e:
                trans.rollback()
                raise e
            
    except HTTPException as http_exc:
         raise http_exc
    except Exception as e:
        print(f"--- ERROR AL OBTENER /configuracion/ ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en la base de datos al obtener configuración: {str(e)}")

@app.put("/configuracion/")
def update_alert_configuration(config: AlertConfigUpdate, current_user: dict = Depends(get_current_user)):
    user_info = read_users_me(current_user) 
    
    update_fields = config.model_dump(exclude_unset=True)
    if not update_fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No hay campos para actualizar")

    set_clause = ", ".join([f"{key} = :{key}" for key in update_fields.keys()])
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
                print(f"❌ Configuración no encontrada para actualizar (usuario_id {user_info.id}).")
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Configuración no encontrada para el usuario.")
            
            print(f"✅ Configuración actualizada para usuario_id: {user_info.id}")
            return dict(result._mapping)
            
    except HTTPException as http_exc:
         raise http_exc
    except Exception as e:
        print(f"--- ERROR AL ACTUALIZAR /configuracion/ ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error al actualizar en la base de datos: {str(e)}")

@app.get("/eventos-caida", response_model=list[EventoCaidaInfo])
def get_eventos_caida(
    skip: int = 0,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    user_info = read_users_me(current_user)

    if user_info.rol not in ['cuidador', 'administrador', 'adulto_mayor']:
        print(f"Acceso denegado a /eventos-caida para usuario {user_info.firebase_uid} con rol {user_info.rol}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso no permitido para este rol.")

    print(f"Obteniendo eventos de caída para usuario_id: {user_info.id} (rol: {user_info.rol}, skip={skip}, limit={limit})")
    try:
        with engine.connect() as db_conn:
            # Diferentes queries según el rol del usuario
            if user_info.rol == 'adulto_mayor':
                # Para adultos mayores: solo sus propios eventos de caída
                query = text("""
                    SELECT
                        a.id,
                        a.adulto_mayor_id,
                        a.dispositivo_id,
                        a.timestamp_alerta,
                        a.url_video_almacenado,
                        a.confirmado_por_cuidador,
                        a.notas,
                        a.detalles_adicionales,
                        d.nombre_dispositivo,
                        am.nombre_completo as nombre_adulto_mayor
                    FROM alertas a
                    JOIN adultos_mayores am ON a.adulto_mayor_id = am.id
                    LEFT JOIN dispositivos d ON a.dispositivo_id = d.id
                    WHERE am.usuario_id = :usuario_id
                        AND a.tipo_alerta = 'caida'
                    ORDER BY a.timestamp_alerta DESC
                    LIMIT :limit OFFSET :offset
                """)

                results = db_conn.execute(query, {
                    "usuario_id": user_info.id,
                    "limit": limit,
                    "offset": skip
                }).fetchall()

            else:
                # Para cuidadores y administradores: eventos de sus adultos mayores a cargo
                query = text("""
                    SELECT
                        a.id,
                        a.adulto_mayor_id,
                        a.dispositivo_id,
                        a.timestamp_alerta,
                        a.url_video_almacenado,
                        a.confirmado_por_cuidador,
                        a.notas,
                        a.detalles_adicionales,
                        d.nombre_dispositivo,
                        am.nombre_completo as nombre_adulto_mayor
                    FROM alertas a
                    JOIN adultos_mayores am ON a.adulto_mayor_id = am.id
                    LEFT JOIN dispositivos d ON a.dispositivo_id = d.id
                    JOIN cuidadores_adultos_mayores cam ON am.id = cam.adulto_mayor_id
                    WHERE cam.usuario_id = :cuidador_id
                        AND a.tipo_alerta = 'caida'
                    ORDER BY a.timestamp_alerta DESC
                    LIMIT :limit OFFSET :offset
                """)

                results = db_conn.execute(query, {
                    "cuidador_id": user_info.id,
                    "limit": limit,
                    "offset": skip
                }).fetchall()

            print(f"✅ Encontrados {len(results)} eventos de caída.")
            eventos = [dict(row._mapping) for row in results]
            return eventos

    except Exception as e:
        print(f"--- ERROR AL OBTENER /eventos-caida ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en la base de datos al obtener eventos: {str(e)}")

# --- INICIO: NUEVO ENDPOINT PARA RECIBIR ALERTAS DE CAÍDA ---
@app.post("/eventos-caida/notificar", status_code=status.HTTP_201_CREATED)
async def notificar_evento_caida(
    evento: CaidaDetectada,
    is_authorized: bool = Depends(verify_internal_token) # Seguridad
):
    """
    Endpoint interno para que el procesador YOLO registre una caída detectada.
    Está protegido por un token secreto (X-Internal-Token).
    """
    print(f"🔔 ¡Alerta de Caída Recibida! Dispositivo: {evento.dispositivo_id}")
    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            try:
                # Primero, obtener el adulto_mayor_id asociado al dispositivo
                query_adulto = text("""
                    SELECT adulto_mayor_id FROM dispositivos WHERE id = :dispositivo_id
                """)
                adulto_result = db_conn.execute(query_adulto, {
                    "dispositivo_id": evento.dispositivo_id
                }).fetchone()

                if not adulto_result or adulto_result[0] is None:
                    raise Exception(f"No se encontró adulto_mayor_id para dispositivo_id={evento.dispositivo_id}")

                adulto_mayor_id = adulto_result[0]

                # Insertar en la tabla alertas con tipo_alerta='caida'
                query = text("""
                    INSERT INTO alertas (
                        adulto_mayor_id, tipo_alerta, dispositivo_id,
                        timestamp_alerta, url_video_almacenado, confirmado_por_cuidador
                    )
                    VALUES (
                        :adulto_mayor_id, 'caida', :dispositivo_id,
                        :timestamp_alerta, :url_video_almacenado, NULL
                    )
                    RETURNING id
                """)
                result = db_conn.execute(query, {
                    "adulto_mayor_id": adulto_mayor_id,
                    "dispositivo_id": evento.dispositivo_id,
                    "timestamp_alerta": evento.timestamp_caida,
                    "url_video_almacenado": evento.url_video_almacenado
                }).fetchone()

                trans.commit()

                if not result:
                    raise Exception("INSERT no devolvió el ID de la alerta de caída.")

                evento_id = result[0]
                print(f"✅ Alerta de caída registrada en BD con ID: {evento_id} (adulto_mayor_id: {adulto_mayor_id})")

                # --- TODO: LÓGICA DE NOTIFICACIÓN PUSH ---
                # Aquí debes agregar la lógica para:
                # 1. Buscar los cuidadores asociados a este dispositivo/adulto mayor (usando el dispositivo_id).
                # 2. Obtener sus tokens FCM desde la tabla 'configuraciones_alerta'.
                # 3. Enviarles una notificación push (FCM) para alertarlos.
                
                return {"status": "evento registrado", "evento_id": evento_id}

            except Exception as e_db:
                print(f"--- ERROR AL REGISTRAR EVENTO DE CAÍDA (DB) ---")
                print(f"ERROR: {str(e_db)}")
                trans.rollback()
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e_db)}")
                
    except Exception as e:
        print(f"--- ERROR INESPERADO AL NOTIFICAR EVENTO ---")
        print(f"ERROR: {str(e)}")
        if isinstance(e, HTTPException):
             raise e
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error inesperado: {str(e)}")
# --- FIN: NUEVO ENDPOINT ---

# --- INICIO: NUEVOS MODELOS Y ENDPOINT PARA GESTIÓN DE DISPOSITIVOS ---
class DeviceHardwareInfo(BaseModel):
    hardware_id: str

class DeviceInfo(BaseModel):
    id: int

@app.post("/dispositivos/get-or-create", response_model=DeviceInfo)
async def get_or_create_device(
    device_info: DeviceHardwareInfo,
    is_authorized: bool = Depends(verify_internal_token)
):
    """
    Endpoint interno para obtener o crear un dispositivo basado en su ID de hardware.
    Busca un dispositivo por su identificador_hw. Si no existe, lo crea.
    Devuelve el ID numérico del dispositivo.
    """
    hw_id = device_info.hardware_id
    print(f"Buscando o creando dispositivo con identificador_hw: {hw_id}")

    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            try:
                # 1. Buscar si el dispositivo ya existe
                query_find = text("SELECT id FROM dispositivos WHERE identificador_hw = :hw_id")
                existing_device = db_conn.execute(query_find, {"hw_id": hw_id}).fetchone()

                if existing_device:
                    device_id = existing_device[0]
                    print(f"✅ Dispositivo encontrado con ID numérico: {device_id}")
                    trans.commit()
                    return DeviceInfo(id=device_id)

                # 2. Si no existe, crearlo
                print(f"ℹ️ Dispositivo no encontrado. Creando nuevo registro...")
                # Crear un nombre descriptivo, ej: "NanoPi (a1b2c3)"
                nombre_dispositivo = f"NanoPi ({hw_id[-6:]})"
                
                query_create = text("""
                    INSERT INTO dispositivos (nombre_dispositivo, identificador_hw)
                    VALUES (:nombre, :hw_id)
                    RETURNING id
                """)
                new_device_result = db_conn.execute(query_create, {
                    "nombre": nombre_dispositivo,
                    "hw_id": hw_id
                }).fetchone()

                if not new_device_result:
                    raise Exception("No se pudo crear el dispositivo en la BD.")

                new_device_id = new_device_result[0]
                print(f"✅ Nuevo dispositivo creado con ID numérico: {new_device_id}")
                
                trans.commit()
                return DeviceInfo(id=new_device_id)

            except Exception as e_db:
                print(f"--- ERROR DURANTE BÚSQUEDA/CREACIÓN DE DISPOSITIVO ---")
                print(f"ERROR: {str(e_db)}")
                trans.rollback()
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD al gestionar dispositivo: {str(e_db)}")

    except Exception as e:
        print(f"--- ERROR INESPERADO EN /dispositivos/get-or-create ---")
        print(f"ERROR: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error inesperado: {str(e)}")
# --- FIN: NUEVOS MODELOS Y ENDPOINT ---


# --- Helper function to check caregiver relationship ---
def check_caregiver_relationship(db_conn, cuidador_id: int, adulto_mayor_id: int):
    """Verifica si el cuidador está vinculado al adulto mayor."""
    query = text("""
        SELECT 1 FROM cuidadores_adultos_mayores
        WHERE usuario_id = :cuidador_id AND adulto_mayor_id = :adulto_mayor_id
    """)
    result = db_conn.execute(query, {"cuidador_id": cuidador_id, "adulto_mayor_id": adulto_mayor_id}).fetchone()
    if not result:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para gestionar recordatorios para esta persona.")

@app.post("/recordatorios", response_model=RecordatorioInfo, status_code=status.HTTP_201_CREATED)
def create_recordatorio(
    recordatorio_data: RecordatorioCreate, 
    current_user: dict = Depends(get_current_user)
):
    user_info = read_users_me(current_user)
    if user_info.rol not in ['cuidador', 'administrador', 'adulto_mayor']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso no permitido.")

    print(f"Intentando crear recordatorio para adulto_mayor_id: {recordatorio_data.adulto_mayor_id} por usuario_id: {user_info.id} (rol: {user_info.rol})")
    
    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            try:
                if user_info.rol == 'cuidador':
                    check_caregiver_relationship(db_conn, user_info.id, recordatorio_data.adulto_mayor_id)
                elif user_info.rol == 'adulto_mayor':
                    query_check = text("SELECT id FROM adultos_mayores WHERE id = :adulto_mayor_id AND usuario_id = :usuario_id")
                    result_check = db_conn.execute(query_check, {
                        "adulto_mayor_id": recordatorio_data.adulto_mayor_id,
                        "usuario_id": user_info.id
                    }).fetchone()
                    if not result_check:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No puedes crear recordatorios para otros usuarios.")
                
                query = text("""
                    INSERT INTO recordatorios (adulto_mayor_id, titulo, descripcion, fecha_hora_programada, frecuencia, tipo_recordatorio, dias_semana)
                    VALUES (:adulto_mayor_id, :titulo, :descripcion, :fecha_hora_programada, :frecuencia, :tipo_recordatorio, :dias_semana)
                    RETURNING id, adulto_mayor_id, titulo, descripcion, fecha_hora_programada, frecuencia, estado, tipo_recordatorio, dias_semana, fecha_creacion
                """)
                
                result = db_conn.execute(query, recordatorio_data.model_dump()).fetchone()
                
                if not result:
                     raise Exception("INSERT no devolvió el recordatorio creado.")
                
                trans.commit()
                
                print(f"✅ Recordatorio creado con ID: {result._mapping['id']}")
                return RecordatorioInfo(**result._mapping)
                
            except Exception as e_db:
                print(f"--- ERROR AL CREAR RECORDATORIO (DB) ---")
                print(f"ERROR: {str(e_db)}")
                trans.rollback()
                
                if isinstance(e_db, HTTPException):
                    raise e_db
                else:
                    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e_db)}")
                
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"--- ERROR INESPERADO AL CREAR RECORDATORIO (Nivel Superior) ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error inesperado: {str(e)}")


@app.get("/recordatorios", response_model=list[RecordatorioInfo])
def get_recordatorios(
    adulto_mayor_id: int | None = None,
    skip: int = 0,
    limit: int = 100,
    current_user: dict = Depends(get_current_user)
):
    user_info = read_users_me(current_user)

    print(f"Obteniendo recordatorios para usuario_id: {user_info.id}, rol: {user_info.rol}, filtro adulto_mayor_id: {adulto_mayor_id}")
    try:
        with engine.connect() as db_conn:
            select_clause = """
                SELECT r.id, r.adulto_mayor_id, r.titulo, r.descripcion, r.fecha_hora_programada, r.frecuencia, r.estado, r.tipo_recordatorio, r.dias_semana, r.fecha_creacion, am.nombre_completo as nombre_adulto_mayor
                FROM recordatorios r
                LEFT JOIN adultos_mayores am ON r.adulto_mayor_id = am.id """
            where_clauses = []
            params = {"limit": limit, "offset": skip}

            if user_info.rol in ['cuidador', 'administrador']:
                if adulto_mayor_id is not None:
                    check_caregiver_relationship(db_conn, user_info.id, adulto_mayor_id)
                    where_clauses.append("r.adulto_mayor_id = :adulto_mayor_id")
                    params["adulto_mayor_id"] = adulto_mayor_id
                else:
                    where_clauses.append("""r.adulto_mayor_id IN (
                        SELECT cam.adulto_mayor_id
                        FROM cuidadores_adultos_mayores cam
                        WHERE cam.usuario_id = :cuidador_id
                    )""")
                    params["cuidador_id"] = user_info.id

            elif user_info.rol == 'adulto_mayor':
                query_am = text("SELECT id FROM adultos_mayores WHERE usuario_id = :usuario_id")
                am_result = db_conn.execute(query_am, {"usuario_id": user_info.id}).fetchone()

                if not am_result:
                    print(f"❌ Usuario {user_info.id} es adulto_mayor pero no tiene registro en tabla adultos_mayores")
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil de adulto mayor no encontrado.")

                am_id = am_result[0]
                where_clauses.append("r.adulto_mayor_id = :adulto_mayor_id")
                params["adulto_mayor_id"] = am_id
                print(f"✓ Adulto mayor {user_info.nombre} (id: {am_id}) consultando sus recordatorios")

            else:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Rol no autorizado para ver recordatorios.")

            where_sql = ""
            if where_clauses:
                where_sql = "WHERE " + " AND ".join(where_clauses)

            query_sql = f"""
                {select_clause}
                {where_sql}
                ORDER BY r.fecha_hora_programada ASC
                LIMIT :limit OFFSET :offset
            """
            query = text(query_sql)

            results = db_conn.execute(query, params).fetchall()
            print(f"✅ Encontrados {len(results)} recordatorios.")

            recordatorios = [RecordatorioInfo(**row._mapping) for row in results]
            return recordatorios

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"--- ERROR AL OBTENER RECORDATORIOS ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e)}")

@app.put("/recordatorios/{recordatorio_id}", response_model=RecordatorioInfo)
def update_recordatorio(
    recordatorio_id: int,
    recordatorio_data: RecordatorioUpdate,
    current_user: dict = Depends(get_current_user)
):
    user_info = read_users_me(current_user)
    if user_info.rol not in ['cuidador', 'administrador', 'adulto_mayor']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso no permitido.")

    update_fields = recordatorio_data.model_dump(exclude_unset=True)
    if not update_fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No hay campos para actualizar")

    set_clause = ", ".join([f"{key} = :{key}" for key in update_fields.keys()])
    params = {**update_fields, "recordatorio_id": recordatorio_id, "usuario_id": user_info.id}

    if user_info.rol == 'cuidador':
        query = text(f"""
            UPDATE recordatorios
            SET {set_clause}
            WHERE id = :recordatorio_id
            AND adulto_mayor_id IN (
                 SELECT cam.adulto_mayor_id
                 FROM cuidadores_adultos_mayores cam
                 WHERE cam.usuario_id = :usuario_id
               )
            RETURNING id, adulto_mayor_id, titulo, descripcion, fecha_hora_programada, frecuencia, estado, tipo_recordatorio, dias_semana, fecha_creacion
        """)
    elif user_info.rol == 'adulto_mayor':
        query = text(f"""
            UPDATE recordatorios
            SET {set_clause}
            WHERE id = :recordatorio_id
            AND adulto_mayor_id IN (
                 SELECT id FROM adultos_mayores WHERE usuario_id = :usuario_id
               )
            RETURNING id, adulto_mayor_id, titulo, descripcion, fecha_hora_programada, frecuencia, estado, tipo_recordatorio, dias_semana, fecha_creacion
        """)
    else:
        query = text(f"""
            UPDATE recordatorios
            SET {set_clause}
            WHERE id = :recordatorio_id
            RETURNING id, adulto_mayor_id, titulo, descripcion, fecha_hora_programada, frecuencia, estado, tipo_recordatorio, dias_semana, fecha_creacion
        """)

    print(f"Intentando actualizar recordatorio id: {recordatorio_id} por usuario_id: {user_info.id} (rol: {user_info.rol})")
    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            result = db_conn.execute(query, params).fetchone()
            trans.commit()

            if not result:
                check_exists_query = text("SELECT adulto_mayor_id FROM recordatorios WHERE id = :id")
                exists = db_conn.execute(check_exists_query, {"id": recordatorio_id}).fetchone()
                if exists:
                    print(f"❌ Intento de actualizar recordatorio {recordatorio_id} por cuidador {user_info.id} sin permiso.")
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para modificar este recordatorio.")
                else:
                    print(f"❌ Recordatorio con id {recordatorio_id} no encontrado.")
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recordatorio no encontrado.")
            
            print(f"✅ Recordatorio {recordatorio_id} actualizado.")
            return RecordatorioInfo(**result._mapping)
            
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"--- ERROR AL ACTUALIZAR RECORDATORIO ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e)}")


@app.delete("/recordatorios/{recordatorio_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recordatorio(
    recordatorio_id: int,
    current_user: dict = Depends(get_current_user)
):
    user_info = read_users_me(current_user)
    if user_info.rol not in ['cuidador', 'administrador', 'adulto_mayor']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso no permitido.")

    params = {"recordatorio_id": recordatorio_id, "usuario_id": user_info.id}

    if user_info.rol == 'cuidador':
        query = text("""
            DELETE FROM recordatorios
            WHERE id = :recordatorio_id
            AND adulto_mayor_id IN (
                 SELECT cam.adulto_mayor_id
                 FROM cuidadores_adultos_mayores cam
                 WHERE cam.usuario_id = :usuario_id
               )
            RETURNING id
        """)
    elif user_info.rol == 'adulto_mayor':
        query = text("""
            DELETE FROM recordatorios
            WHERE id = :recordatorio_id
            AND adulto_mayor_id IN (
                 SELECT id FROM adultos_mayores WHERE usuario_id = :usuario_id
               )
            RETURNING id
        """)
    else:
        query = text("""
            DELETE FROM recordatorios
            WHERE id = :recordatorio_id
            RETURNING id
        """)

    print(f"Intentando eliminar recordatorio id: {recordatorio_id} por usuario_id: {user_info.id} (rol: {user_info.rol})")
    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            result = db_conn.execute(query, params).fetchone()
            trans.commit()

            if not result:
                check_exists_query = text("SELECT adulto_mayor_id FROM recordatorios WHERE id = :id")
                exists = db_conn.execute(check_exists_query, {"id": recordatorio_id}).fetchone()
                if exists:
                    print(f"❌ Intento de eliminar recordatorio {recordatorio_id} por cuidador {user_info.id} sin permiso.")
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para eliminar este recordatorio.")
                else:
                    print(f"❌ Recordatorio con id {recordatorio_id} no encontrado para eliminar.")
                    pass
            else:
                 print(f"✅ Recordatorio {recordatorio_id} eliminado.")
                 
            return None 

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"--- ERROR AL ELIMINAR RECORDATORIO ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e)}")

# --- ENDPOINTS DE SOLICITUDES DE CUIDADO ---
@app.post("/solicitudes-cuidado", response_model=SolicitudCuidadoInfo, status_code=status.HTTP_201_CREATED)
def crear_solicitud_cuidado(
    solicitud_data: SolicitudCuidadoCreate,
    current_user: dict = Depends(get_current_user)
):
    user_info = read_users_me(current_user)
    if user_info.rol != 'cuidador':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo los cuidadores pueden enviar solicitudes de cuidado.")
    if solicitud_data.email_destinatario.lower() == user_info.email.lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes enviarte una solicitud a ti mismo.")

    print(f"Cuidador {user_info.id} ({user_info.email}) enviando solicitud a {solicitud_data.email_destinatario}")
    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            try:
                query_check_user = text("SELECT id FROM usuarios WHERE email = :email")
                destinatario = db_conn.execute(query_check_user, {"email": solicitud_data.email_destinatario}).fetchone()
                destinatario_id = destinatario[0] if destinatario else None

                if destinatario_id:
                    query_check_existing = text("""
                        SELECT id FROM solicitudes_cuidado
                        WHERE cuidador_id = :cuidador_id
                        AND usuario_destinatario_id = :destinatario_id
                        AND estado = 'pendiente'
                    """)
                    existing = db_conn.execute(query_check_existing, {
                        "cuidador_id": user_info.id,
                        "destinatario_id": destinatario_id
                    }).fetchone()
                    if existing:
                        trans.rollback()
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Ya existe una solicitud pendiente para este usuario."
                        )

                query = text("""
                    INSERT INTO solicitudes_cuidado
                    (cuidador_id, email_destinatario, usuario_destinatario_id, mensaje, estado)
                    VALUES (:cuidador_id, :email, :destinatario_id, :mensaje, 'pendiente')
                    RETURNING id, cuidador_id, email_destinatario, usuario_destinatario_id, estado, mensaje, fecha_solicitud, fecha_respuesta
                """)
                result = db_conn.execute(query, {
                    "cuidador_id": user_info.id,
                    "email": solicitud_data.email_destinatario,
                    "destinatario_id": destinatario_id,
                    "mensaje": solicitud_data.mensaje
                }).fetchone()

                if not result:
                    trans.rollback()
                    raise Exception("INSERT no devolvió la solicitud creada.")

                trans.commit()
                print(f"✅ Solicitud creada con ID: {result._mapping['id']}")
                response_data = dict(result._mapping)
                response_data['nombre_cuidador'] = user_info.nombre
                response_data['email_cuidador'] = user_info.email
                return SolicitudCuidadoInfo(**response_data)

            except HTTPException as http_exc:
                trans.rollback()
                raise http_exc
            except Exception as e_db:
                print(f"--- ERROR AL CREAR SOLICITUD (DB) ---")
                print(f"ERROR: {str(e_db)}")
                trans.rollback()
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e_db)}")
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"--- ERROR INESPERADO AL CREAR SOLICITUD ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error inesperado: {str(e)}")

@app.get("/solicitudes-cuidado/recibidas", response_model=list[SolicitudCuidadoInfo])
def obtener_solicitudes_recibidas(current_user: dict = Depends(get_current_user)):
    user_info = read_users_me(current_user)
    print(f"Obteniendo solicitudes recibidas para usuario {user_info.id}")
    try:
        with engine.connect() as db_conn:
            query = text("""
                SELECT
                    sc.id, sc.cuidador_id, sc.email_destinatario,
                    sc.usuario_destinatario_id, sc.estado, sc.mensaje,
                    sc.fecha_solicitud, sc.fecha_respuesta,
                    u.nombre as nombre_cuidador,
                    u.email as email_cuidador
                FROM solicitudes_cuidado sc
                JOIN usuarios u ON sc.cuidador_id = u.id
                WHERE sc.usuario_destinatario_id = :user_id
                ORDER BY sc.fecha_solicitud DESC
            """)
            results = db_conn.execute(query, {"user_id": user_info.id}).fetchall()
            print(f"✅ Encontradas {len(results)} solicitudes recibidas.")
            solicitudes = [SolicitudCuidadoInfo(**row._mapping) for row in results]
            return solicitudes
    except Exception as e:
        print(f"--- ERROR AL OBTENER SOLICITUDES RECIBIDAS ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e)}")

@app.get("/solicitudes-cuidado/enviadas", response_model=list[SolicitudCuidadoInfo])
def obtener_solicitudes_enviadas(current_user: dict = Depends(get_current_user)):
    user_info = read_users_me(current_user)
    if user_info.rol != 'cuidador':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo los cuidadores pueden ver solicitudes enviadas.")
    print(f"Obteniendo solicitudes enviadas por cuidador {user_info.id}")
    try:
        with engine.connect() as db_conn:
            query = text("""
                SELECT
                    sc.id, sc.cuidador_id, sc.email_destinatario,
                    sc.usuario_destinatario_id, sc.estado, sc.mensaje,
                    sc.fecha_solicitud, sc.fecha_respuesta,
                    u.nombre as nombre_cuidador,
                    u.email as email_cuidador
                FROM solicitudes_cuidado sc
                JOIN usuarios u ON sc.cuidador_id = u.id
                WHERE sc.cuidador_id = :cuidador_id
                ORDER BY sc.fecha_solicitud DESC
            """)
            results = db_conn.execute(query, {"cuidador_id": user_info.id}).fetchall()
            print(f"✅ Encontradas {len(results)} solicitudes enviadas.")
            solicitudes = [SolicitudCuidadoInfo(**row._mapping) for row in results]
            return solicitudes
    except Exception as e:
        print(f"--- ERROR AL OBTENER SOLICITUDES ENVIADAS ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e)}")

@app.put("/solicitudes-cuidado/{solicitud_id}/aceptar", response_model=SolicitudCuidadoInfo)
def aceptar_solicitud_cuidado(
    solicitud_id: int,
    current_user: dict = Depends(get_current_user)
):
    user_info = read_users_me(current_user)
    print(f"Usuario {user_info.id} intentando aceptar solicitud {solicitud_id}")
    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            try:
                query_check = text("""
                    SELECT cuidador_id, usuario_destinatario_id, estado
                    FROM solicitudes_cuidado
                    WHERE id = :id
                """)
                solicitud = db_conn.execute(query_check, {"id": solicitud_id}).fetchone()

                if not solicitud:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada.")
                if solicitud._mapping['usuario_destinatario_id'] != user_info.id:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Esta solicitud no es para ti.")
                if solicitud._mapping['estado'] != 'pendiente':
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Esta solicitud ya fue {solicitud._mapping['estado']}.")

                cuidador_id = solicitud._mapping['cuidador_id']

                query_update_rol = text("""
                    UPDATE usuarios
                    SET rol = 'adulto_mayor'
                    WHERE id = :id
                """)
                db_conn.execute(query_update_rol, {"id": user_info.id})
                print(f"✅ Rol actualizado a 'adulto_mayor' para usuario {user_info.id}")

                query_check_am = text("SELECT id FROM adultos_mayores WHERE usuario_id = :id")
                am_exists = db_conn.execute(query_check_am, {"id": user_info.id}).fetchone()

                if am_exists:
                    adulto_mayor_id = am_exists[0]
                    print(f"ℹ️ Adulto mayor ya existía con ID: {adulto_mayor_id}")
                else:
                    query_create_am = text("""
                        INSERT INTO adultos_mayores (usuario_id, nombre_completo)
                        VALUES (:usuario_id, :nombre)
                        RETURNING id
                    """)
                    am_result = db_conn.execute(query_create_am, {
                        "usuario_id": user_info.id,
                        "nombre": user_info.nombre
                    }).fetchone()
                    adulto_mayor_id = am_result[0]
                    print(f"✅ Registro de adulto mayor creado con ID: {adulto_mayor_id}")

                query_create_relation = text("""
                    INSERT INTO cuidadores_adultos_mayores (usuario_id, adulto_mayor_id)
                    VALUES (:cuidador_id, :adulto_mayor_id)
                    ON CONFLICT (usuario_id, adulto_mayor_id) DO NOTHING
                """)
                db_conn.execute(query_create_relation, {
                    "cuidador_id": cuidador_id,
                    "adulto_mayor_id": adulto_mayor_id
                })
                print(f"✅ Relación creada: cuidador {cuidador_id} -> adulto mayor {adulto_mayor_id}")

                query_cuidador = text("SELECT nombre, email FROM usuarios WHERE id = :id")
                cuidador_info = db_conn.execute(query_cuidador, {"id": cuidador_id}).fetchone()

                query_update_solicitud = text("""
                    UPDATE solicitudes_cuidado
                    SET estado = 'aceptada', fecha_respuesta = NOW()
                    WHERE id = :id
                    RETURNING id, cuidador_id, email_destinatario, usuario_destinatario_id,
                              estado, mensaje, fecha_solicitud, fecha_respuesta
                """)
                result = db_conn.execute(query_update_solicitud, {"id": solicitud_id}).fetchone()

                trans.commit()
                print(f"✅ Solicitud {solicitud_id} aceptada exitosamente")

                response_data = dict(result._mapping)
                response_data['nombre_cuidador'] = cuidador_info._mapping['nombre']
                response_data['email_cuidador'] = cuidador_info._mapping['email']
                return SolicitudCuidadoInfo(**response_data)

            except HTTPException as http_exc:
                trans.rollback()
                raise http_exc
            except Exception as e_db:
                print(f"--- ERROR AL ACEPTAR SOLICITUD (DB) ---")
                print(f"ERROR: {str(e_db)}")
                trans.rollback()
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e_db)}")
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"--- ERROR INESPERADO AL ACEPTAR SOLICITUD ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error inesperado: {str(e)}")

@app.put("/solicitudes-cuidado/{solicitud_id}/rechazar", response_model=SolicitudCuidadoInfo)
def rechazar_solicitud_cuidado(
    solicitud_id: int,
    current_user: dict = Depends(get_current_user)
):
    user_info = read_users_me(current_user)
    print(f"Usuario {user_info.id} intentando rechazar solicitud {solicitud_id}")
    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            try:
                query_check = text("""
                    SELECT cuidador_id, usuario_destinatario_id, estado
                    FROM solicitudes_cuidado
                    WHERE id = :id
                """)
                solicitud = db_conn.execute(query_check, {"id": solicitud_id}).fetchone()

                if not solicitud:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada.")
                if solicitud._mapping['usuario_destinatario_id'] != user_info.id:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Esta solicitud no es para ti.")
                if solicitud._mapping['estado'] != 'pendiente':
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Esta solicitud ya fue {solicitud._mapping['estado']}.")

                cuidador_id = solicitud._mapping['cuidador_id']

                query_cuidador = text("SELECT nombre, email FROM usuarios WHERE id = :id")
                cuidador_info = db_conn.execute(query_cuidador, {"id": cuidador_id}).fetchone()

                query_update = text("""
                    UPDATE solicitudes_cuidado
                    SET estado = 'rechazada', fecha_respuesta = NOW()
                    WHERE id = :id
                    RETURNING id, cuidador_id, email_destinatario, usuario_destinatario_id,
                              estado, mensaje, fecha_solicitud, fecha_respuesta
                """)
                result = db_conn.execute(query_update, {"id": solicitud_id}).fetchone()

                trans.commit()
                print(f"✅ Solicitud {solicitud_id} rechazada")

                response_data = dict(result._mapping)
                response_data['nombre_cuidador'] = cuidador_info._mapping['nombre']
                response_data['email_cuidador'] = cuidador_info._mapping['email']
                return SolicitudCuidadoInfo(**response_data)

            except HTTPException as http_exc:
                trans.rollback()
                raise http_exc
            except Exception as e_db:
                print(f"--- ERROR AL RECHAZAR SOLICITUD (DB) ---")
                print(f"ERROR: {str(e_db)}")
                trans.rollback()
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e_db)}")
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"--- ERROR INESPERADO AL RECHAZAR SOLICITUD ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error inesperado: {str(e)}")

# --- ENDPOINTS: /adultos-mayores ---
@app.get("/adultos-mayores", response_model=list[AdultoMayorInfo])
def obtener_adultos_mayores(current_user: dict = Depends(get_current_user)):
    user_info = read_users_me(current_user)
    if user_info.rol not in ['cuidador', 'administrador']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso no permitido.")

    print(f"Obteniendo adultos mayores para cuidador {user_info.id}")
    try:
        with engine.connect() as db_conn:
            query = text("""
                SELECT am.*
                FROM adultos_mayores am
                JOIN cuidadores_adultos_mayores cam ON am.id = cam.adulto_mayor_id
                WHERE cam.usuario_id = :cuidador_id
                ORDER BY am.nombre_completo ASC
            """)
            results = db_conn.execute(query, {"cuidador_id": user_info.id}).fetchall()
            print(f"✅ Encontrados {len(results)} adultos mayores.")
            adultos = [AdultoMayorInfo(**row._mapping) for row in results]
            return adultos
    except Exception as e:
        print(f"--- ERROR AL OBTENER ADULTOS MAYORES ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e)}")

@app.get("/adultos-mayores/mi-perfil", response_model=AdultoMayorInfo)
def obtener_mi_perfil_adulto_mayor(current_user: dict = Depends(get_current_user)):
    user_info = read_users_me(current_user)
    if user_info.rol != 'adulto_mayor':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Este endpoint es solo para adultos mayores.")

    print(f"Obteniendo perfil de adulto mayor para usuario_id: {user_info.id}")
    try:
        with engine.connect() as db_conn:
            query = text("SELECT * FROM adultos_mayores WHERE usuario_id = :usuario_id")
            result = db_conn.execute(query, {"usuario_id": user_info.id}).fetchone()
            if not result:
                raise HTTPException(status_code=status.HTTP_4404_NOT_FOUND, detail="Perfil de adulto mayor no encontrado.")
            print(f"✅ Perfil encontrado: {result._mapping['nombre_completo']}")
            return AdultoMayorInfo(**result._mapping)
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"--- ERROR AL OBTENER PERFIL DE ADULTO MAYOR ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e)}")

@app.get("/adultos-mayores/{adulto_mayor_id}", response_model=AdultoMayorInfo)
def obtener_adulto_mayor(
    adulto_mayor_id: int,
    current_user: dict = Depends(get_current_user)
):
    user_info = read_users_me(current_user)
    if user_info.rol not in ['cuidador', 'administrador']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso no permitido.")

    print(f"Obteniendo detalles del adulto mayor {adulto_mayor_id} para cuidador {user_info.id}")
    try:
        with engine.connect() as db_conn:
            check_caregiver_relationship(db_conn, user_info.id, adulto_mayor_id)
            query = text("SELECT * FROM adultos_mayores WHERE id = :id")
            result = db_conn.execute(query, {"id": adulto_mayor_id}).fetchone()
            if not result:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Adulto mayor no encontrado.")
            print(f"✅ Adulto mayor encontrado: {result._mapping['nombre_completo']}")
            return AdultoMayorInfo(**result._mapping)
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"--- ERROR AL OBTENER ADULTO MAYOR ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e)}")

@app.put("/adultos-mayores/{adulto_mayor_id}", response_model=AdultoMayorInfo)
def actualizar_adulto_mayor(
    adulto_mayor_id: int,
    adulto_data: AdultoMayorUpdate,
    current_user: dict = Depends(get_current_user)
):
    user_info = read_users_me(current_user)

    if user_info.rol not in ['cuidador', 'administrador', 'adulto_mayor']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso no permitido.")

    update_fields = adulto_data.model_dump(exclude_unset=True)
    if not update_fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No hay campos para actualizar")

    set_clause = ", ".join([f"{key} = :{key}" for key in update_fields.keys()])
    params = {**update_fields, "adulto_mayor_id": adulto_mayor_id, "usuario_id": user_info.id}

    if user_info.rol in ['cuidador', 'administrador']:
        print(f"Actualizando adulto mayor {adulto_mayor_id} por cuidador {user_info.id}")
        query = text(f"""
            UPDATE adultos_mayores
            SET {set_clause}
            WHERE id = :adulto_mayor_id
            AND id IN (
                SELECT cam.adulto_mayor_id
                FROM cuidadores_adultos_mayores cam
                WHERE cam.usuario_id = :usuario_id
            )
            RETURNING *
        """)
    else: # Es 'adulto_mayor'
        print(f"Actualizando perfil propio de adulto mayor {adulto_mayor_id} por usuario {user_info.id}")
        query = text(f"""
            UPDATE adultos_mayores
            SET {set_clause}
            WHERE id = :adulto_mayor_id
            AND usuario_id = :usuario_id
            RETURNING *
        """)
    
    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            result = db_conn.execute(query, params).fetchone()
            trans.commit()

            if not result:
                check_exists = text("SELECT id FROM adultos_mayores WHERE id = :id")
                exists = db_conn.execute(check_exists, {"id": adulto_mayor_id}).fetchone()
                if exists:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permiso para modificar este perfil.")
                else:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Perfil de adulto mayor no encontrado.")

            print(f"✅ Adulto mayor {adulto_mayor_id} actualizado")
            return AdultoMayorInfo(**result._mapping)

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"--- ERROR AL ACTUALIZAR ADULTO MAYOR ---")
        print(f"ERROR: {str(e)}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD: {str(e)}")


# --- ENDPOINTS DE ALERTAS ---

@app.post("/alertas", response_model=AlertaInfo, status_code=status.HTTP_201_CREATED)
def crear_alerta(
    alerta_data: AlertaCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Crea una alerta (ayuda o caída). Solo el adulto mayor puede crear su propia alerta.
    """
    user_info = read_users_me(current_user)

    # Verificar que el usuario es adulto_mayor
    if user_info.rol != 'adulto_mayor':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los adultos mayores pueden crear alertas."
        )

    # Verificar que el adulto_mayor_id corresponde al usuario actual
    with engine.connect() as db_conn:
        query_check = text("""
            SELECT id FROM adultos_mayores
            WHERE id = :adulto_mayor_id AND usuario_id = :usuario_id
        """)
        result_check = db_conn.execute(query_check, {
            "adulto_mayor_id": alerta_data.adulto_mayor_id,
            "usuario_id": user_info.id
        }).fetchone()

        if not result_check:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para crear alertas para este perfil."
            )

    # Crear la alerta
    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            query_insert = text("""
                INSERT INTO alertas (
                    adulto_mayor_id, tipo_alerta, timestamp_alerta,
                    dispositivo_id, url_video_almacenado, detalles_adicionales
                )
                VALUES (
                    :adulto_mayor_id, :tipo_alerta, NOW(),
                    :dispositivo_id, :url_video_almacenado, :detalles_adicionales
                )
                RETURNING id, adulto_mayor_id, tipo_alerta, timestamp_alerta,
                          dispositivo_id, url_video_almacenado,
                          confirmado_por_cuidador, notas, detalles_adicionales, fecha_registro
            """)
            result = db_conn.execute(query_insert, {
                "adulto_mayor_id": alerta_data.adulto_mayor_id,
                "tipo_alerta": alerta_data.tipo_alerta,
                "dispositivo_id": alerta_data.dispositivo_id,
                "url_video_almacenado": alerta_data.url_video_almacenado,
                "detalles_adicionales": json.dumps(alerta_data.detalles_adicionales) if alerta_data.detalles_adicionales else None
            }).fetchone()
            trans.commit()

            # Obtener nombre del adulto mayor
            query_nombre = text("""
                SELECT nombre_completo FROM adultos_mayores WHERE id = :id
            """)
            nombre_result = db_conn.execute(query_nombre, {"id": alerta_data.adulto_mayor_id}).fetchone()
            nombre_adulto_mayor = nombre_result[0] if nombre_result else None

            print(f"✅ Alerta creada (tipo: {alerta_data.tipo_alerta}) para adulto mayor {alerta_data.adulto_mayor_id}")

            return AlertaInfo(
                **result._mapping,
                nombre_adulto_mayor=nombre_adulto_mayor
            )

    except Exception as e:
        print(f"❌ Error al crear alerta: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al crear la alerta: {str(e)}"
        )


@app.get("/alertas", response_model=list[AlertaInfo])
def get_alertas(
    adulto_mayor_id: int | None = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Obtiene alertas (ayuda y caídas).
    - Cuidadores: ven todas las alertas de sus adultos mayores
    - Adultos mayores: ven solo sus propias alertas
    """
    user_info = read_users_me(current_user)

    with engine.connect() as db_conn:
        if user_info.rol == 'cuidador':
            # Obtener IDs de adultos mayores bajo su cuidado
            query_adultos = text("""
                SELECT adulto_mayor_id FROM cuidadores_adultos_mayores
                WHERE usuario_id = :usuario_id
            """)
            adultos_result = db_conn.execute(query_adultos, {"usuario_id": user_info.id}).fetchall()
            adultos_ids = [row[0] for row in adultos_result]

            if not adultos_ids:
                return []

            # Construir query para obtener alertas
            if adulto_mayor_id:
                # Verificar que el cuidador tiene acceso a este adulto mayor
                if adulto_mayor_id not in adultos_ids:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="No tienes permiso para ver alertas de este adulto mayor."
                    )
                query_alertas = text("""
                    SELECT a.*, am.nombre_completo as nombre_adulto_mayor
                    FROM alertas a
                    JOIN adultos_mayores am ON a.adulto_mayor_id = am.id
                    WHERE a.adulto_mayor_id = :adulto_mayor_id
                    ORDER BY a.timestamp_alerta DESC
                """)
                params = {"adulto_mayor_id": adulto_mayor_id}
            else:
                # Obtener todas las alertas de todos sus adultos mayores
                placeholders = ','.join([f':id{i}' for i in range(len(adultos_ids))])
                query_alertas = text(f"""
                    SELECT a.*, am.nombre_completo as nombre_adulto_mayor
                    FROM alertas a
                    JOIN adultos_mayores am ON a.adulto_mayor_id = am.id
                    WHERE a.adulto_mayor_id IN ({placeholders})
                    ORDER BY a.timestamp_alerta DESC
                """)
                params = {f'id{i}': aid for i, aid in enumerate(adultos_ids)}

            alertas_result = db_conn.execute(query_alertas, params).fetchall()

        elif user_info.rol == 'adulto_mayor':
            # Obtener el adulto_mayor_id del usuario
            query_adulto_mayor = text("""
                SELECT id FROM adultos_mayores WHERE usuario_id = :usuario_id
            """)
            adulto_result = db_conn.execute(query_adulto_mayor, {"usuario_id": user_info.id}).fetchone()

            if not adulto_result:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Perfil de adulto mayor no encontrado."
                )

            adulto_id = adulto_result[0]
            query_alertas = text("""
                SELECT a.*, am.nombre_completo as nombre_adulto_mayor
                FROM alertas a
                JOIN adultos_mayores am ON a.adulto_mayor_id = am.id
                WHERE a.adulto_mayor_id = :adulto_mayor_id
                ORDER BY a.timestamp_alerta DESC
            """)
            alertas_result = db_conn.execute(query_alertas, {"adulto_mayor_id": adulto_id}).fetchall()

        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para ver alertas."
            )

        return [AlertaInfo(**row._mapping) for row in alertas_result]


@app.put("/alertas/{alerta_id}", response_model=AlertaInfo)
def actualizar_alerta(
    alerta_id: int,
    confirmado: bool,
    notas: str | None = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Permite al cuidador marcar una alerta como confirmada/falsa alarma y agregar notas.
    """
    user_info = read_users_me(current_user)

    if user_info.rol != 'cuidador':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo los cuidadores pueden actualizar alertas."
        )

    with engine.connect() as db_conn:
        # Verificar que el cuidador tiene acceso a este adulto mayor
        query_check = text("""
            SELECT a.adulto_mayor_id
            FROM alertas a
            JOIN cuidadores_adultos_mayores cam ON a.adulto_mayor_id = cam.adulto_mayor_id
            WHERE a.id = :alerta_id AND cam.usuario_id = :usuario_id
        """)
        check_result = db_conn.execute(query_check, {
            "alerta_id": alerta_id,
            "usuario_id": user_info.id
        }).fetchone()

        if not check_result:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para actualizar esta alerta."
            )

        # Actualizar la alerta
        trans = db_conn.begin()
        query_update = text("""
            UPDATE alertas
            SET confirmado_por_cuidador = :confirmado, notas = :notas
            WHERE id = :alerta_id
            RETURNING id, adulto_mayor_id, tipo_alerta, timestamp_alerta,
                      dispositivo_id, url_video_almacenado,
                      confirmado_por_cuidador, notas, detalles_adicionales, fecha_registro
        """)
        result = db_conn.execute(query_update, {
            "confirmado": confirmado,
            "notas": notas,
            "alerta_id": alerta_id
        }).fetchone()
        trans.commit()

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Alerta no encontrada."
            )

        # Obtener nombre del adulto mayor
        query_nombre = text("""
            SELECT nombre_completo FROM adultos_mayores WHERE id = :id
        """)
        nombre_result = db_conn.execute(query_nombre, {"id": result.adulto_mayor_id}).fetchone()
        nombre_adulto_mayor = nombre_result[0] if nombre_result else None

        return AlertaInfo(
            **result._mapping,
            nombre_adulto_mayor=nombre_adulto_mayor
        )

# --- FIN DE ENDPOINTS ---