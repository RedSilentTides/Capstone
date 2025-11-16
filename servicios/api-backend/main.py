import os
import requests
from fastapi import FastAPI, HTTPException, Depends, status, Header
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, constr, validator
from sqlalchemy import create_engine, text, engine as sqlalchemy_engine
import json
import firebase_admin
from firebase_admin import credentials, auth
from firebase_admin.exceptions import FirebaseError
from datetime import datetime, timedelta
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import storage

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
    "https://mivigilia.cl",
    "https://app.mivigilia.cl",
    "exp://",  # Para Expo Go
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

class PushTokenUpdate(BaseModel):
    push_token: str

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
    snapshot_url: str | None = None  # URL del snapshot de la caída
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
# El secret en GCP se llama "internal-api-key" y se mapea a la variable INTERNAL_API_KEY
# Limpiar el API key de posibles espacios en blanco o saltos de línea
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "CAMBIA_ESTA_CLAVE_SECRETA_POR_DEFECTO").strip()

async def verify_internal_token(x_internal_token: str = Header(None)):
    """Verifica que la llamada provenga de otro servicio tuyo."""
    print(f"🔍 DEBUG: Token recibido: '{x_internal_token}' (len: {len(x_internal_token) if x_internal_token else 0})")
    print(f"🔍 DEBUG: Token esperado: '{INTERNAL_API_KEY}' (len: {len(INTERNAL_API_KEY)})")

    if not x_internal_token:
         print(f"❌ Acceso interno denegado. Falta X-Internal-Token.")
         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Falta token de autorización interna.")

    if x_internal_token != INTERNAL_API_KEY:
        print(f"❌ Intento de acceso interno fallido. Token recibido no coincide.")
        print(f"🔍 DEBUG: Comparación byte a byte:")
        print(f"   Recibido bytes: {x_internal_token.encode('utf-8').hex()}")
        print(f"   Esperado bytes: {INTERNAL_API_KEY.encode('utf-8').hex()}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso no autorizado.")

    print(f"✅ Token interno verificado correctamente")
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

async def get_current_user_optional(authorization: str = Header(None)) -> dict | None:
    """
    Verifica el token ID de Firebase de forma opcional.
    Retorna None si no hay Authorization header.
    """
    if not authorization:
        return None

    # Extraer token del header "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None

    token = parts[1]

    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        print(f"Error al verificar token opcional: {e}")
        return None

# --- FIN DE SEGURIDAD Y AUTENTICACIÓN ---

# --- Helper Functions ---

def enviar_push_notification(push_tokens: list[str], titulo: str, mensaje: str, data: dict | None = None):
    """
    Envía notificaciones push usando la API de Expo Push Notifications.

    Args:
        push_tokens: Lista de tokens de Expo Push Notifications
        titulo: Título de la notificación
        mensaje: Cuerpo del mensaje
        data: Datos adicionales para la notificación (opcional)

    Returns:
        Diccionario con el resultado del envío
    """
    if not push_tokens:
        print("⚠️  No hay tokens para enviar notificaciones")
        return {"success": False, "message": "No hay tokens"}

    # Filtrar tokens válidos (deben empezar con ExponentPushToken)
    # Los tokens de desarrollo (DEV-TOKEN-*) se ignoran pero no generan error
    tokens_validos = [token for token in push_tokens if token and token.startswith('ExponentPushToken')]
    tokens_dev = [token for token in push_tokens if token and token.startswith('DEV-TOKEN-')]

    if tokens_dev:
        print(f"ℹ️  {len(tokens_dev)} tokens de desarrollo detectados (modo local)")
        print("   Las notificaciones se mostrarán localmente en esos dispositivos")

    if not tokens_validos:
        if tokens_dev:
            # Solo hay tokens de desarrollo, está bien
            return {"success": True, "message": "Tokens de desarrollo (notificaciones locales)", "dev_mode": True}
        print("⚠️  No hay tokens válidos de Expo")
        return {"success": False, "message": "No hay tokens válidos"}

    # Preparar mensajes para Expo
    messages = []
    for token in tokens_validos:
        message = {
            "to": token,
            "sound": "default",
            "title": titulo,
            "body": mensaje,
            "data": data or {},
            "priority": "high",
            "channelId": "default"
        }
        messages.append(message)

    try:
        # Enviar a la API de Expo Push Notifications
        response = requests.post(
            'https://exp.host/--/api/v2/push/send',
            json=messages,
            headers={
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout=10
        )

        response.raise_for_status()
        result = response.json()

        print(f"✅ Notificaciones push enviadas: {len(messages)} mensajes")
        print(f"   Resultado: {result}")

        return {"success": True, "result": result, "sent_count": len(messages)}

    except requests.exceptions.RequestException as e:
        print(f"❌ Error al enviar notificaciones push: {str(e)}")
        return {"success": False, "error": str(e)}
    except Exception as e:
        print(f"❌ Error inesperado al enviar notificaciones: {str(e)}")
        return {"success": False, "error": str(e)}


def enviar_email_notificacion(
    tipo_notificacion: str,
    destinatarios: list[dict],
    adulto_mayor_nombre: str,
    timestamp: datetime,
    **kwargs
):
    """
    Envía notificaciones por email usando el servicio api-email.

    Args:
        tipo_notificacion: 'caida', 'ayuda', o 'recordatorio'
        destinatarios: Lista de diccionarios con {email, nombre}
        adulto_mayor_nombre: Nombre del adulto mayor
        timestamp: Timestamp de la alerta/recordatorio
        **kwargs: Parámetros adicionales según el tipo de notificación
            - Para caida: url_video, dispositivo_id
            - Para ayuda: mensaje_adicional
            - Para recordatorio: titulo_recordatorio, descripcion, tipo_recordatorio, fecha_hora_programada

    Returns:
        Diccionario con el resultado del envío
    """
    if not destinatarios:
        print("⚠️  No hay destinatarios de email")
        return {"success": False, "message": "No hay destinatarios"}

    email_service_url = os.environ.get("EMAIL_SERVICE_URL", "").strip()
    internal_api_key = os.environ.get("INTERNAL_API_KEY", "").strip()

    if not email_service_url:
        print("⚠️  EMAIL_SERVICE_URL no configurado")
        return {"success": False, "message": "Servicio de email no configurado"}

    # Preparar el endpoint según el tipo de notificación
    endpoint_map = {
        "caida": "/send/alerta-caida",
        "ayuda": "/send/alerta-ayuda",
        "recordatorio": "/send/recordatorio"
    }

    endpoint = endpoint_map.get(tipo_notificacion)
    if not endpoint:
        print(f"⚠️  Tipo de notificación no válido: {tipo_notificacion}")
        return {"success": False, "message": "Tipo de notificación inválido"}

    # Preparar el payload según el tipo
    payload = {
        "tipo": tipo_notificacion,
        "destinatarios": destinatarios,
        "adulto_mayor_nombre": adulto_mayor_nombre,
        "timestamp": timestamp.isoformat()
    }

    # Agregar campos específicos según el tipo
    if tipo_notificacion == "caida":
        payload["url_video"] = kwargs.get("url_video")
        payload["dispositivo_id"] = kwargs.get("dispositivo_id")
        payload["detalles_adicionales"] = kwargs.get("detalles_adicionales")
    elif tipo_notificacion == "ayuda":
        payload["mensaje_adicional"] = kwargs.get("mensaje_adicional")
        payload["detalles_adicionales"] = kwargs.get("detalles_adicionales")
    elif tipo_notificacion == "recordatorio":
        payload["titulo_recordatorio"] = kwargs.get("titulo_recordatorio")
        payload["descripcion"] = kwargs.get("descripcion")
        payload["tipo_recordatorio"] = kwargs.get("tipo_recordatorio", "otro")
        payload["fecha_hora_programada"] = kwargs.get("fecha_hora_programada", timestamp).isoformat()

    try:
        response = requests.post(
            f"{email_service_url}{endpoint}",
            json=payload,
            headers={
                "X-Internal-Key": internal_api_key,
                "Content-Type": "application/json"
            },
            timeout=10
        )

        if response.status_code == 200:
            result = response.json()
            enviados = result.get("resultado", {}).get("enviados_exitosamente", 0)
            print(f"✅ Emails enviados: {enviados}/{len(destinatarios)} destinatarios")
            return {"success": True, "result": result, "sent_count": enviados}
        else:
            print(f"⚠️  Error al enviar emails: Status {response.status_code}")
            print(f"   Response: {response.text}")
            return {"success": False, "error": f"Status code {response.status_code}"}

    except requests.exceptions.Timeout:
        print(f"⚠️  Timeout al contactar servicio de email")
        return {"success": False, "error": "Timeout"}
    except requests.exceptions.RequestException as e:
        print(f"❌ Error al enviar emails: {str(e)}")
        return {"success": False, "error": str(e)}
    except Exception as e:
        print(f"❌ Error inesperado al enviar emails: {str(e)}")
        return {"success": False, "error": str(e)}

# --- FIN Helper Functions ---

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

                # Enviar email de bienvenida
                try:
                    email_service_url = os.environ.get("EMAIL_SERVICE_URL", "").strip()
                    internal_api_key = os.environ.get("INTERNAL_API_KEY", "").strip()

                    if email_service_url and internal_api_key:
                        payload = {
                            "destinatarios": [{"email": user.email, "name": user.nombre}],
                            "nombre_usuario": user.nombre,
                            "rol": user.rol
                        }

                        response = requests.post(
                            f"{email_service_url}/send/bienvenida",
                            json=payload,
                            headers={"X-Internal-Key": internal_api_key},
                            timeout=10
                        )

                        if response.status_code == 200:
                            print(f"✅ Email de bienvenida enviado a {user.email}")
                        else:
                            print(f"⚠️  Error al enviar email de bienvenida: Status {response.status_code}")
                    else:
                        print(f"⚠️  No se pudo enviar email de bienvenida: servicio no configurado")
                except Exception as email_error:
                    print(f"⚠️  Error al enviar email de bienvenida: {str(email_error)}")
                    # No lanzamos excepción para no afectar el registro exitoso del usuario

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

@app.post("/usuarios/push-token", status_code=status.HTTP_200_OK)
def register_push_token(token_data: PushTokenUpdate, current_user: dict = Depends(get_current_user)):
    """
    Registra o actualiza el token de push notification del usuario autenticado.
    """
    user_uid = current_user.get("uid")
    if not user_uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido, UID no encontrado.")

    # Obtener información actual del usuario
    user_info = read_users_me(current_user)

    print(f"Registrando push token para usuario_id: {user_info.id} (firebase_uid: {user_uid})")

    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            try:
                # Actualizar push_token en la base de datos
                query = text("""
                    UPDATE usuarios
                    SET push_token = :push_token
                    WHERE id = :id AND firebase_uid = :uid
                """)
                result = db_conn.execute(query, {
                    "push_token": token_data.push_token,
                    "id": user_info.id,
                    "uid": user_uid
                })

                if result.rowcount == 0:
                    trans.rollback()
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado.")

                trans.commit()
                print(f"✅ Push token registrado para usuario_id: {user_info.id}")

                return {"message": "Push token registrado correctamente", "success": True}

            except HTTPException as http_exc:
                trans.rollback()
                raise http_exc
            except Exception as e_db:
                print(f"--- ERROR AL REGISTRAR PUSH TOKEN (DB) ---")
                print(f"ERROR: {str(e_db)}")
                trans.rollback()
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error en BD al registrar push token: {str(e_db)}")

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        print(f"--- ERROR INESPERADO AL REGISTRAR PUSH TOKEN ---")
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

            eventos = []
            for row in results:
                evento_dict = dict(row._mapping)

                # Convertir detalles_adicionales de string JSON a dict si es necesario
                detalles = evento_dict.get('detalles_adicionales')
                if detalles and isinstance(detalles, str):
                    try:
                        evento_dict['detalles_adicionales'] = json.loads(detalles)
                    except Exception as e:
                        # Si falla la conversión, dejar como None para evitar errores
                        evento_dict['detalles_adicionales'] = None

                eventos.append(evento_dict)

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

                # Obtener información del adulto mayor ANTES del commit
                query_adulto_info = text("""
                    SELECT nombre_completo FROM adultos_mayores WHERE id = :adulto_mayor_id
                """)
                adulto_info = db_conn.execute(query_adulto_info, {"adulto_mayor_id": adulto_mayor_id}).fetchone()
                nombre_adulto_mayor = adulto_info[0] if adulto_info else "Adulto Mayor"

                # Obtener cuidadores ANTES del commit
                query_cuidadores = text("""
                    SELECT DISTINCT u.id, u.push_token
                    FROM cuidadores_adultos_mayores cam
                    JOIN usuarios u ON cam.usuario_id = u.id
                    WHERE cam.adulto_mayor_id = :adulto_mayor_id
                    AND u.push_token IS NOT NULL
                """)
                cuidadores = db_conn.execute(query_cuidadores, {"adulto_mayor_id": adulto_mayor_id}).fetchall()

                # Insertar en la tabla alertas con tipo_alerta='caida'
                # Incluimos snapshot_url en detalles_adicionales (JSON)
                detalles = {}
                if evento.snapshot_url:
                    detalles["snapshot_url"] = evento.snapshot_url

                query = text("""
                    INSERT INTO alertas (
                        adulto_mayor_id, tipo_alerta, dispositivo_id,
                        timestamp_alerta, url_video_almacenado, confirmado_por_cuidador,
                        detalles_adicionales
                    )
                    VALUES (
                        :adulto_mayor_id, 'caida', :dispositivo_id,
                        :timestamp_alerta, :url_video_almacenado, NULL,
                        :detalles_adicionales
                    )
                    RETURNING id
                """)
                result = db_conn.execute(query, {
                    "adulto_mayor_id": adulto_mayor_id,
                    "dispositivo_id": evento.dispositivo_id,
                    "timestamp_alerta": evento.timestamp_caida,
                    "url_video_almacenado": evento.url_video_almacenado,
                    "detalles_adicionales": json.dumps(detalles) if detalles else None
                }).fetchone()

                if not result:
                    raise Exception("INSERT no devolvió el ID de la alerta de caída.")

                evento_id = result[0]

                trans.commit()

                print(f"✅ Alerta de caída registrada en BD con ID: {evento_id} (adulto_mayor_id: {adulto_mayor_id})")

                # --- LÓGICA DE NOTIFICACIÓN PUSH, WEBSOCKET Y WHATSAPP ---
                # 1. Obtener nombre del adulto mayor
                query_nombre = text("""
                    SELECT nombre_completo FROM adultos_mayores WHERE id = :adulto_mayor_id
                """)
                nombre_result = db_conn.execute(query_nombre, {"adulto_mayor_id": adulto_mayor_id}).fetchone()
                nombre_adulto = nombre_result[0] if nombre_result else "un adulto mayor"

                # 2. Obtener cuidadores y sus tokens push
                query_cuidadores = text("""
                    SELECT u.id, u.nombre, ca.token_fcm_app, ca.notificar_app
                    FROM usuarios u
                    INNER JOIN cuidadores_adultos_mayores cam ON cam.usuario_id = u.id
                    LEFT JOIN configuraciones_alerta ca ON ca.usuario_id = u.id
                    WHERE cam.adulto_mayor_id = :adulto_mayor_id
                      AND u.rol = 'cuidador'
                """)
                cuidadores = db_conn.execute(query_cuidadores, {"adulto_mayor_id": adulto_mayor_id}).fetchall()

                # 3. Enviar notificaciones push
                titulo = "🚨 Alerta de Caída Detectada"
                mensaje = f"Posible caída detectada para {nombre_adulto}"

                push_tokens = [c[2] for c in cuidadores if c[3] and c[2]]  # token_fcm_app y notificar_app=True
                if push_tokens:
                    try:
                        expo_push_url = "https://exp.host/--/api/v2/push/send"
                        push_messages = [
                            {
                                "to": token,
                                "sound": "default",
                                "title": titulo,
                                "body": mensaje,
                                "data": {"tipo": "caida", "alerta_id": evento_id}
                            }
                            for token in push_tokens
                        ]
                        push_response = requests.post(expo_push_url, json=push_messages, timeout=10)
                        if push_response.status_code == 200:
                            print(f"📱 Notificaciones push enviadas a {len(push_tokens)} cuidadores")
                        else:
                            print(f"⚠️  Error al enviar push: {push_response.status_code}")
                    except Exception as push_error:
                        print(f"⚠️  Error al enviar notificaciones push: {str(push_error)}")

                # 4. Enviar notificación WebSocket
                try:
                    websocket_service_url = os.environ.get("WEBSOCKET_SERVICE_URL", "").strip() or None
                    internal_api_key = os.environ.get("INTERNAL_API_KEY", "").strip()

                    if websocket_service_url:
                        websocket_payload = {
                            "id": evento_id,
                            "adulto_mayor_id": adulto_mayor_id,
                            "tipo_alerta": "caida",
                            "timestamp_alerta": evento.timestamp_caida.isoformat(),
                            "nombre_adulto_mayor": nombre_adulto,
                            "url_video_almacenado": evento.url_video_almacenado,
                            "dispositivo_id": evento.dispositivo_id
                        }
                        if evento.snapshot_url:
                            websocket_payload["snapshot_url"] = evento.snapshot_url
                        ws_response = requests.post(
                            f"{websocket_service_url}/internal/notify-alert",
                            json=websocket_payload,
                            headers={"X-Internal-Key": internal_api_key},
                            timeout=10
                        )
                        if ws_response.status_code == 200:
                            data = ws_response.json()
                            print(f"🌐 Notificación WebSocket enviada: {data.get('notified_count', 0)} cuidadores conectados")
                        else:
                            print(f"⚠️  WebSocket service error: {ws_response.status_code}")
                except Exception as ws_error:
                    print(f"⚠️  Error al enviar notificación WebSocket: {str(ws_error)}")

                # 5. Enviar notificaciones WhatsApp
                try:
                    query_whatsapp = text("""
                        SELECT u.id, u.nombre, ca.numero_whatsapp
                        FROM usuarios u
                        INNER JOIN cuidadores_adultos_mayores cam ON cam.usuario_id = u.id
                        LEFT JOIN configuraciones_alerta ca ON ca.usuario_id = u.id
                        WHERE cam.adulto_mayor_id = :adulto_mayor_id
                          AND ca.notificar_whatsapp = TRUE
                          AND ca.numero_whatsapp IS NOT NULL
                          AND u.rol = 'cuidador'
                    """)
                    whatsapp_configs = db_conn.execute(query_whatsapp, {"adulto_mayor_id": adulto_mayor_id}).fetchall()

                    if whatsapp_configs:
                        whatsapp_service_url = os.environ.get("WHATSAPP_SERVICE_URL", "https://whatsapp-webhook-687053793381.southamerica-west1.run.app").strip()
                        webhook_api_key = os.environ.get("WEBHOOK_API_KEY", "").strip()

                        whatsapp_success = 0
                        whatsapp_fail = 0
                        for config in whatsapp_configs:
                            phone = config[2]
                            payload = {
                                "phone_number": phone,
                                "notification_type": "fall_alert",  # Actualizado para usar template alertacaidatest
                                "title": titulo,
                                "body": mensaje,
                                "parameters": {
                                    "nombre_adulto_mayor": nombre_adulto  # Parámetro requerido por el template
                                }
                            }
                            try:
                                wsp_response = requests.post(
                                    f"{whatsapp_service_url}/send-notification",
                                    json=payload,
                                    headers={"X-API-Key": webhook_api_key},
                                    timeout=10
                                )
                                if wsp_response.status_code == 200:
                                    whatsapp_success += 1
                                    print(f"✅ WhatsApp enviado a {phone}")
                                else:
                                    whatsapp_fail += 1
                                    print(f"⚠️  WhatsApp falló para {phone}: {wsp_response.status_code}")
                            except Exception as wsp_error:
                                whatsapp_fail += 1
                                print(f"⚠️  Error WhatsApp para {phone}: {str(wsp_error)}")

                        if whatsapp_success > 0:
                            print(f"📱 Notificaciones WhatsApp enviadas a {whatsapp_success}/{whatsapp_success + whatsapp_fail} cuidadores")
                    else:
                        print(f"ℹ️  No hay cuidadores con WhatsApp habilitado para adulto mayor {adulto_mayor_id}")
                except Exception as whatsapp_error:
                    print(f"⚠️  Error al enviar notificaciones WhatsApp: {str(whatsapp_error)}")

                # 6. Enviar notificaciones por Email
                try:
                    query_email = text("""
                        SELECT u.id, u.nombre, u.email, ca.notificar_email, ca.email_secundario
                        FROM usuarios u
                        INNER JOIN cuidadores_adultos_mayores cam ON cam.usuario_id = u.id
                        LEFT JOIN configuraciones_alerta ca ON ca.usuario_id = u.id
                        WHERE cam.adulto_mayor_id = :adulto_mayor_id
                          AND u.rol = 'cuidador'
                          AND (ca.notificar_email IS NULL OR ca.notificar_email = TRUE)
                    """)
                    email_configs = db_conn.execute(query_email, {"adulto_mayor_id": adulto_mayor_id}).fetchall()

                    if email_configs:
                        # Preparar lista de destinatarios
                        destinatarios_email = []
                        for config in email_configs:
                            nombre_cuidador = config[1]
                            email_principal = config[2]
                            email_secundario = config[4]

                            # Usar email secundario si está configurado, sino el principal
                            email_destino = email_secundario if email_secundario else email_principal

                            if email_destino:
                                destinatarios_email.append({
                                    "email": email_destino,
                                    "name": nombre_cuidador
                                })

                        if destinatarios_email:
                            enviar_email_notificacion(
                                tipo_notificacion="caida",
                                destinatarios=destinatarios_email,
                                adulto_mayor_nombre=nombre_adulto,
                                timestamp=evento.timestamp_caida,
                                url_video=evento.url_video_almacenado,
                                dispositivo_id=evento.dispositivo_id
                            )
                        else:
                            print(f"ℹ️  No hay emails válidos para enviar notificaciones")
                    else:
                        print(f"ℹ️  No hay cuidadores con email habilitado para adulto mayor {adulto_mayor_id}")
                except Exception as email_error:
                    print(f"⚠️  Error al enviar notificaciones por email: {str(email_error)}")

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
    adulto_mayor_id: int | None = None

class DeviceConfigRequest(BaseModel):
    identificador_hw: str
    adulto_mayor_id: int
    usuario_camara: str
    contrasena_camara: str

class DeviceConfigResponse(BaseModel):
    success: bool
    message: str
    device_id: int

class DeviceDetailsResponse(BaseModel):
    id: int
    identificador_hw: str
    nombre_dispositivo: str
    usuario_camara: str | None = None
    fecha_configuracion: str | None = None

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
                query_find = text("SELECT id, adulto_mayor_id FROM dispositivos WHERE identificador_hw = :hw_id")
                existing_device = db_conn.execute(query_find, {"hw_id": hw_id}).fetchone()

                if existing_device:
                    device_id = existing_device[0]
                    adulto_mayor_id = existing_device[1]
                    print(f"✅ Dispositivo encontrado con ID numérico: {device_id}, Adulto Mayor ID: {adulto_mayor_id}")
                    trans.commit()
                    return DeviceInfo(id=device_id, adulto_mayor_id=adulto_mayor_id)

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
                return DeviceInfo(id=new_device_id, adulto_mayor_id=None)

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

@app.post("/dispositivos/configurar", response_model=DeviceConfigResponse)
async def configurar_dispositivo(
    config: DeviceConfigRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Endpoint para configurar un dispositivo NanoPi.
    Asocia un dispositivo (por su hardware_id) con un adulto mayor y guarda las credenciales de la cámara.
    """
    # Obtener información completa del usuario desde la BD
    user_info = read_users_me(current_user)

    print(f"📱 Configurando dispositivo: {config.identificador_hw}")
    print(f"   Adulto Mayor ID: {config.adulto_mayor_id}")
    print(f"   Usuario Cámara: {config.usuario_camara}")

    try:
        with engine.connect() as db_conn:
            trans = db_conn.begin()
            try:
                # 1. Verificar que el adulto mayor existe y pertenece al cuidador
                user_db_id = user_info.id
                verify_query = text("""
                    SELECT am.id FROM adultos_mayores am
                    JOIN cuidadores_adultos_mayores cam ON am.id = cam.adulto_mayor_id
                    WHERE am.id = :adulto_mayor_id AND cam.usuario_id = :cuidador_id
                """)
                adulto_existe = db_conn.execute(verify_query, {
                    "adulto_mayor_id": config.adulto_mayor_id,
                    "cuidador_id": user_db_id
                }).fetchone()

                if not adulto_existe:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="No tienes permiso para configurar este adulto mayor"
                    )

                # 2. Buscar si el dispositivo ya existe
                find_device = text("SELECT id FROM dispositivos WHERE identificador_hw = :hw_id")
                existing_device = db_conn.execute(find_device, {"hw_id": config.identificador_hw}).fetchone()

                device_id = None
                if existing_device:
                    # 3a. Si existe, actualizar la configuración
                    device_id = existing_device[0]
                    print(f"   Actualizando dispositivo existente ID: {device_id}")

                    update_query = text("""
                        UPDATE dispositivos
                        SET adulto_mayor_id = :adulto_mayor_id,
                            usuario_camara = :usuario_camara,
                            contrasena_camara_encrypted = :contrasena,
                            fecha_configuracion = CURRENT_TIMESTAMP
                        WHERE id = :device_id
                    """)
                    db_conn.execute(update_query, {
                        "adulto_mayor_id": config.adulto_mayor_id,
                        "usuario_camara": config.usuario_camara,
                        "contrasena": config.contrasena_camara,  # TODO: Encriptar en producción
                        "device_id": device_id
                    })
                else:
                    # 3b. Si no existe, crearlo con toda la configuración
                    print(f"   Creando nuevo dispositivo")
                    nombre_dispositivo = f"NanoPi ({config.identificador_hw[-6:]})"

                    create_query = text("""
                        INSERT INTO dispositivos
                        (nombre_dispositivo, identificador_hw, adulto_mayor_id,
                         usuario_camara, contrasena_camara_encrypted, fecha_configuracion)
                        VALUES (:nombre, :hw_id, :adulto_mayor_id, :usuario_camara, :contrasena, CURRENT_TIMESTAMP)
                        RETURNING id
                    """)
                    result = db_conn.execute(create_query, {
                        "nombre": nombre_dispositivo,
                        "hw_id": config.identificador_hw,
                        "adulto_mayor_id": config.adulto_mayor_id,
                        "usuario_camara": config.usuario_camara,
                        "contrasena": config.contrasena_camara  # TODO: Encriptar en producción
                    }).fetchone()

                    if not result:
                        raise Exception("No se pudo crear el dispositivo")

                    device_id = result[0]

                trans.commit()
                print(f"✅ Dispositivo configurado exitosamente. ID: {device_id}")

                return DeviceConfigResponse(
                    success=True,
                    message=f"Dispositivo configurado exitosamente para {config.identificador_hw}",
                    device_id=device_id
                )

            except HTTPException:
                trans.rollback()
                raise
            except Exception as e:
                trans.rollback()
                print(f"❌ Error configurando dispositivo: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Error al configurar dispositivo: {str(e)}"
                )

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error inesperado: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error inesperado: {str(e)}"
        )

@app.get("/dispositivos/adulto-mayor/{adulto_mayor_id}", response_model=DeviceDetailsResponse | None)
async def get_dispositivo_by_adulto_mayor(
    adulto_mayor_id: int,
    current_user: dict = Depends(get_current_user)
):
    """
    Obtiene el dispositivo NanoPi asociado a un adulto mayor.
    Retorna None si no hay dispositivo configurado.
    """
    # Obtener información completa del usuario desde la BD
    user_info = read_users_me(current_user)

    try:
        with engine.connect() as db_conn:
            # Verificar que el cuidador tiene acceso a este adulto mayor
            check_caregiver_relationship(db_conn, user_info.id, adulto_mayor_id)

            # Buscar el dispositivo asociado
            query = text("""
                SELECT id, identificador_hw, nombre_dispositivo, usuario_camara, fecha_configuracion
                FROM dispositivos
                WHERE adulto_mayor_id = :adulto_mayor_id
            """)
            result = db_conn.execute(query, {"adulto_mayor_id": adulto_mayor_id}).fetchone()

            if not result:
                return None

            return DeviceDetailsResponse(
                id=result[0],
                identificador_hw=result[1],
                nombre_dispositivo=result[2],
                usuario_camara=result[3],
                fecha_configuracion=result[4].isoformat() if result[4] else None
            )

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error obteniendo dispositivo: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al obtener dispositivo: {str(e)}"
        )
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

            # Enviar notificaciones push a los cuidadores asociados
            try:
                # Obtener los push tokens de los cuidadores asociados al adulto mayor
                query_tokens = text("""
                    SELECT u.push_token
                    FROM usuarios u
                    INNER JOIN cuidadores_adultos_mayores cam ON cam.usuario_id = u.id
                    WHERE cam.adulto_mayor_id = :adulto_mayor_id
                      AND u.push_token IS NOT NULL
                      AND u.rol = 'cuidador'
                """)
                tokens_result = db_conn.execute(query_tokens, {"adulto_mayor_id": alerta_data.adulto_mayor_id}).fetchall()
                push_tokens = [row[0] for row in tokens_result if row[0]]

                if push_tokens:
                    # Preparar el título y mensaje según el tipo de alerta
                    if alerta_data.tipo_alerta == 'ayuda':
                        titulo = "🚨 Solicitud de Ayuda"
                        mensaje = f"{nombre_adulto_mayor or 'Un adulto mayor'} necesita ayuda"
                    else:  # caida
                        titulo = "⚠️ Alerta de Caída Detectada"
                        mensaje = f"Posible caída detectada para {nombre_adulto_mayor or 'un adulto mayor'}"

                    # Enviar las notificaciones
                    enviar_push_notification(
                        push_tokens=push_tokens,
                        titulo=titulo,
                        mensaje=mensaje,
                        data={
                            "tipo": "alerta",
                            "alerta_id": result[0],  # ID de la alerta creada
                            "tipo_alerta": alerta_data.tipo_alerta,
                            "adulto_mayor_id": alerta_data.adulto_mayor_id
                        }
                    )
                    print(f"📱 Notificaciones push enviadas a {len(push_tokens)} cuidadores")
                else:
                    print(f"⚠️  No hay cuidadores con push tokens configurados para adulto mayor {alerta_data.adulto_mayor_id}")

            except Exception as notif_error:
                # No fallar la creación de alerta si falla el envío de notificaciones
                print(f"⚠️  Error al enviar notificaciones push (alerta creada exitosamente): {str(notif_error)}")

            # Notificar via WebSocket a cuidadores conectados en tiempo real
            try:
                websocket_url = os.environ.get("WEBSOCKET_SERVICE_URL", "https://alertas-websocket-687053793381.southamerica-west1.run.app")
                internal_key = os.environ.get("INTERNAL_API_KEY", "").strip()

                alerta_dict = {
                    "id": result[0],
                    "adulto_mayor_id": result[1],
                    "tipo_alerta": result[2],
                    "timestamp_alerta": result[3].isoformat() if result[3] else None,
                    "dispositivo_id": result[4],
                    "url_video_almacenado": result[5],
                    "confirmado_por_cuidador": result[6],
                    "notas": result[7],
                    "detalles_adicionales": result[8],
                    "fecha_registro": result[9].isoformat() if result[9] else None,
                    "nombre_adulto_mayor": nombre_adulto_mayor
                }

                response = requests.post(
                    f"{websocket_url}/internal/notify-alert",
                    json=alerta_dict,
                    headers={"X-Internal-Key": internal_key},
                    timeout=5
                )

                if response.status_code == 200:
                    result_data = response.json()
                    print(f"🌐 Notificación WebSocket enviada: {result_data.get('notified_count', 0)} cuidadores conectados")
                else:
                    print(f"⚠️  WebSocket service respondió con código {response.status_code}")

            except requests.exceptions.Timeout:
                print(f"⚠️  Timeout al contactar servicio WebSocket (alerta creada exitosamente)")
            except requests.exceptions.RequestException as ws_error:
                print(f"⚠️  Error al notificar via WebSocket (alerta creada exitosamente): {str(ws_error)}")
            except Exception as ws_error:
                print(f"⚠️  Error inesperado al notificar via WebSocket: {str(ws_error)}")

            # Enviar notificaciones por Email
            if alerta_data.tipo_alerta in ['ayuda', 'caida']:
                try:
                    query_email = text("""
                        SELECT u.id, u.nombre, u.email, ca.notificar_email, ca.email_secundario
                        FROM usuarios u
                        INNER JOIN cuidadores_adultos_mayores cam ON cam.usuario_id = u.id
                        LEFT JOIN configuraciones_alerta ca ON ca.usuario_id = u.id
                        WHERE cam.adulto_mayor_id = :adulto_mayor_id
                          AND u.rol = 'cuidador'
                          AND (ca.notificar_email IS NULL OR ca.notificar_email = TRUE)
                    """)
                    email_configs = db_conn.execute(query_email, {"adulto_mayor_id": alerta_data.adulto_mayor_id}).fetchall()

                    if email_configs:
                        # Preparar lista de destinatarios
                        destinatarios_email = []
                        for config in email_configs:
                            nombre_cuidador = config[1]
                            email_principal = config[2]
                            email_secundario = config[4]

                            # Usar email secundario si está configurado, sino el principal
                            email_destino = email_secundario if email_secundario else email_principal

                            if email_destino:
                                destinatarios_email.append({
                                    "email": email_destino,
                                    "name": nombre_cuidador
                                })

                        if destinatarios_email:
                            # Determinar tipo de notificación
                            tipo_email = "ayuda" if alerta_data.tipo_alerta == "ayuda" else "caida"

                            enviar_email_notificacion(
                                tipo_notificacion=tipo_email,
                                destinatarios=destinatarios_email,
                                adulto_mayor_nombre=nombre_adulto_mayor or "Adulto Mayor",
                                timestamp=result[3] if result[3] else datetime.utcnow(),
                                mensaje_adicional=alerta_data.detalles_adicionales.get("mensaje") if alerta_data.detalles_adicionales else None,
                                url_video=alerta_data.url_video_almacenado,
                                dispositivo_id=alerta_data.dispositivo_id
                            )
                        else:
                            print(f"ℹ️  No hay emails válidos para enviar notificaciones")
                    else:
                        print(f"ℹ️  No hay cuidadores con email habilitado")
                except Exception as email_error:
                    print(f"⚠️  Error al enviar notificaciones por email: {str(email_error)}")

            # Enviar notificaciones WhatsApp a cuidadores configurados
            try:
                query_whatsapp = text("""
                    SELECT u.id, u.nombre, ca.numero_whatsapp
                    FROM usuarios u
                    INNER JOIN cuidadores_adultos_mayores cam ON cam.usuario_id = u.id
                    LEFT JOIN configuraciones_alerta ca ON ca.usuario_id = u.id
                    WHERE cam.adulto_mayor_id = :adulto_mayor_id
                      AND ca.notificar_whatsapp = TRUE
                      AND ca.numero_whatsapp IS NOT NULL
                      AND u.rol = 'cuidador'
                """)
                whatsapp_configs = db_conn.execute(
                    query_whatsapp,
                    {"adulto_mayor_id": alerta_data.adulto_mayor_id}
                ).fetchall()

                if whatsapp_configs:
                    whatsapp_service_url = os.environ.get(
                        "WHATSAPP_SERVICE_URL",
                        "https://whatsapp-webhook-687053793381.southamerica-west1.run.app"
                    ).strip()
                    webhook_api_key = os.environ.get("WEBHOOK_API_KEY", "").strip()

                    whatsapp_count = 0
                    for config in whatsapp_configs:
                        phone = config[2]  # numero_whatsapp

                        # Determinar tipo de notificación según tipo de alerta
                        if alerta_data.tipo_alerta == 'ayuda':
                            notification_type = "help_alert"
                        else:  # caida
                            notification_type = "fall_alert"

                        payload = {
                            "phone_number": phone,
                            "notification_type": notification_type,
                            "title": titulo,  # Ya definido anteriormente (línea ~1820)
                            "body": mensaje,   # Ya definido anteriormente (línea ~1820)
                            "parameters": {
                                "nombre_adulto_mayor": nombre_adulto_mayor or "Adulto Mayor"
                            }
                        }

                        try:
                            whatsapp_response = requests.post(
                                f"{whatsapp_service_url}/send-notification",
                                json=payload,
                                headers={"X-API-Key": webhook_api_key},
                                timeout=10
                            )

                            if whatsapp_response.status_code == 200:
                                whatsapp_count += 1
                                print(f"✅ WhatsApp enviado a {phone}")
                            else:
                                print(f"⚠️  WhatsApp falló para {phone}: {whatsapp_response.status_code}")

                        except requests.exceptions.Timeout:
                            print(f"⚠️  Timeout al enviar WhatsApp a {phone}")
                        except Exception as wsp_single_error:
                            print(f"⚠️  Error al enviar WhatsApp a {phone}: {str(wsp_single_error)}")

                    if whatsapp_count > 0:
                        print(f"📱 Notificaciones WhatsApp enviadas a {whatsapp_count}/{len(whatsapp_configs)} cuidadores")
                    else:
                        print(f"⚠️  No se pudieron enviar notificaciones WhatsApp")
                else:
                    print(f"ℹ️  No hay cuidadores con WhatsApp habilitado para adulto mayor {alerta_data.adulto_mayor_id}")

            except Exception as whatsapp_error:
                # No fallar la creación de alerta si falla WhatsApp
                print(f"⚠️  Error al enviar notificaciones WhatsApp (alerta creada exitosamente): {str(whatsapp_error)}")

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
    También envía una notificación push al adulto mayor cuando se confirma la alerta.
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
        # Si se confirma "Ya voy", agregar timestamp de cooldown extendido (5 minutos)
        if confirmado and notas:
            cooldown_until = datetime.utcnow() + timedelta(minutes=5)
            detalles_update_json = json.dumps({"cooldown_extendido_hasta": cooldown_until.isoformat()})

            query_update = text("""
                UPDATE alertas
                SET confirmado_por_cuidador = :confirmado,
                    notas = :notas,
                    detalles_adicionales = COALESCE(detalles_adicionales, '{}'::jsonb) || CAST(:detalles_update AS jsonb)
                WHERE id = :alerta_id
                RETURNING id, adulto_mayor_id, tipo_alerta, timestamp_alerta,
                          dispositivo_id, url_video_almacenado,
                          confirmado_por_cuidador, notas, detalles_adicionales, fecha_registro
            """)
            result = db_conn.execute(query_update, {
                "confirmado": confirmado,
                "notas": notas,
                "alerta_id": alerta_id,
                "detalles_update": detalles_update_json
            }).fetchone()
        else:
            query_update = text("""
                UPDATE alertas
                SET confirmado_por_cuidador = :confirmado,
                    notas = :notas
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

        db_conn.commit()

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

        # Si la alerta fue confirmada (YA VOY), enviar notificaciones al adulto mayor
        if confirmado and notas:
            try:
                # Obtener el push token del adulto mayor
                query_push_token = text("""
                    SELECT u.push_token, u.nombre
                    FROM adultos_mayores am
                    JOIN usuarios u ON am.usuario_id = u.id
                    WHERE am.id = :adulto_mayor_id AND u.push_token IS NOT NULL
                """)
                token_result = db_conn.execute(query_push_token, {
                    "adulto_mayor_id": result.adulto_mayor_id
                }).fetchone()

                if token_result and token_result[0]:
                    push_token = token_result[0]
                    nombre_adulto = token_result[1]

                    # Enviar notificación push
                    titulo = "💙 Tu cuidador está en camino"
                    mensaje = f"{user_info.nombre} te confirmó: {notas}"

                    enviar_push_notification(
                        push_tokens=[push_token],
                        titulo=titulo,
                        mensaje=mensaje,
                        data={
                            "tipo": "confirmacion_alerta",
                            "alerta_id": alerta_id,
                            "cuidador_nombre": user_info.nombre
                        }
                    )
                    print(f"📱 Notificación 'YA VOY' enviada a {nombre_adulto} (adulto mayor)")
                else:
                    print(f"⚠️  Adulto mayor no tiene push token configurado")

                # Enviar notificación WebSocket en tiempo real para web
                try:
                    websocket_url = os.environ.get("WEBSOCKET_SERVICE_URL", "https://alertas-websocket-687053793381.southamerica-west1.run.app")
                    internal_key = os.environ.get("INTERNAL_API_KEY", "").strip()

                    confirmation_data = {
                        "adulto_mayor_id": result.adulto_mayor_id,
                        "alerta_id": alerta_id,
                        "titulo": "💙 Tu cuidador está en camino",
                        "mensaje": f"{user_info.nombre} te confirmó: {notas}",
                        "cuidador_nombre": user_info.nombre
                    }

                    ws_response = requests.post(
                        f"{websocket_url}/internal/notify-confirmation",
                        json=confirmation_data,
                        headers={"X-Internal-Key": internal_key},
                        timeout=5
                    )

                    if ws_response.status_code == 200:
                        ws_data = ws_response.json()
                        if ws_data.get("notified"):
                            print(f"🌐 Confirmación WebSocket enviada al adulto mayor")
                        else:
                            print(f"⚠️  Adulto mayor no conectado al WebSocket")
                    else:
                        print(f"⚠️  Error al enviar confirmación WebSocket: {ws_response.status_code}")

                except Exception as ws_error:
                    print(f"⚠️  Error al enviar confirmación WebSocket: {ws_error}")

            except Exception as e:
                # No fallar si la notificación falla, pero registrar el error
                print(f"⚠️  Error al enviar notificaciones al adulto mayor: {e}")

        return AlertaInfo(
            **result._mapping,
            nombre_adulto_mayor=nombre_adulto_mayor
        )


@app.get("/alertas/{alerta_id}/snapshot")
def obtener_snapshot_alerta(
    alerta_id: int,
    token: str = None,
    current_user: dict = Depends(get_current_user_optional)
):
    """
    Sirve la imagen del snapshot de una alerta de caída directamente desde GCS.
    Acepta autenticación por header Authorization o query parameter token.
    """
    from fastapi.responses import StreamingResponse
    import io

    # Si viene token por query parameter, autenticar con eso
    if token and not current_user:
        try:
            decoded_token = auth.verify_id_token(token)
            current_user = decoded_token
        except Exception as e:
            print(f"Error al verificar token de query: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido"
            )

    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No autenticado"
        )

    user_info = read_users_me(current_user)

    with engine.connect() as db_conn:
        # Verificar que el usuario tiene acceso a esta alerta
        if user_info.rol == 'cuidador':
            query_check = text("""
                SELECT a.detalles_adicionales, a.adulto_mayor_id
                FROM alertas a
                JOIN cuidadores_adultos_mayores cam ON a.adulto_mayor_id = cam.adulto_mayor_id
                WHERE a.id = :alerta_id AND cam.usuario_id = :usuario_id
            """)
            result = db_conn.execute(query_check, {
                "alerta_id": alerta_id,
                "usuario_id": user_info.id
            }).fetchone()
        elif user_info.rol == 'adulto_mayor':
            query_check = text("""
                SELECT a.detalles_adicionales, a.adulto_mayor_id
                FROM alertas a
                JOIN adultos_mayores am ON a.adulto_mayor_id = am.id
                WHERE a.id = :alerta_id AND am.usuario_id = :usuario_id
            """)
            result = db_conn.execute(query_check, {
                "alerta_id": alerta_id,
                "usuario_id": user_info.id
            }).fetchone()
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permiso para acceder a esta alerta."
            )

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Alerta no encontrada o sin acceso."
            )

        detalles = result[0] if result[0] else {}

        # Extraer snapshot_url de detalles_adicionales
        snapshot_url = detalles.get("snapshot_url")

        if not snapshot_url:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Esta alerta no tiene snapshot disponible."
            )

        # Verificar que la URL es de GCS
        if not snapshot_url.startswith("gs://"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="URL de snapshot inválida."
            )

        try:
            # Parsear gs://bucket/path
            parts = snapshot_url.replace("gs://", "").split("/", 1)
            if len(parts) != 2:
                raise ValueError("Formato de URL inválido")

            bucket_name = parts[0]
            blob_path = parts[1]

            # Descargar la imagen desde GCS y servirla directamente
            storage_client = storage.Client()
            bucket = storage_client.bucket(bucket_name)
            blob = bucket.blob(blob_path)

            # Verificar que el blob existe
            if not blob.exists():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="La imagen del snapshot no existe en el almacenamiento."
                )

            # Descargar el contenido
            image_bytes = blob.download_as_bytes()

            # Determinar el tipo de contenido
            content_type = blob.content_type or "image/jpeg"

            # Retornar como streaming response
            return StreamingResponse(
                io.BytesIO(image_bytes),
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=3600",
                    "Content-Disposition": f"inline; filename=snapshot_{alerta_id}.jpg"
                }
            )

        except HTTPException:
            raise
        except Exception as e:
            print(f"❌ Error al obtener snapshot desde GCS: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error al obtener snapshot: {str(e)}"
            )


@app.post("/dispositivos/check-cooldown")
def verificar_cooldown_extendido(
    dispositivo_id: int,
    adulto_mayor_id: int,
    x_internal_token: str = Header(None, alias="X-Internal-Token")
):
    """
    Endpoint interno para que el edge verifique si hay cooldown extendido activo.
    Retorna True si hay cooldown activo, False si puede crear nueva alerta.
    """
    # Verificar autenticación interna
    internal_token = os.environ.get("INTERNAL_API_KEY", "").strip()
    if not internal_token or x_internal_token != internal_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token interno inválido"
        )

    with engine.connect() as db_conn:
        # Buscar alerta reciente con cooldown extendido activo
        query = text("""
            SELECT detalles_adicionales->>'cooldown_extendido_hasta' as cooldown_hasta
            FROM alertas
            WHERE adulto_mayor_id = :adulto_mayor_id
              AND dispositivo_id = :dispositivo_id
              AND confirmado_por_cuidador = TRUE
              AND detalles_adicionales->>'cooldown_extendido_hasta' IS NOT NULL
            ORDER BY timestamp_alerta DESC
            LIMIT 1
        """)

        result = db_conn.execute(query, {
            "adulto_mayor_id": adulto_mayor_id,
            "dispositivo_id": dispositivo_id
        }).fetchone()

        if not result or not result[0]:
            return {
                "cooldown_activo": False,
                "puede_crear_alerta": True
            }

        # Verificar si el cooldown sigue activo
        try:
            cooldown_hasta = datetime.fromisoformat(result[0])
            ahora = datetime.utcnow()

            if ahora < cooldown_hasta:
                segundos_restantes = int((cooldown_hasta - ahora).total_seconds())
                return {
                    "cooldown_activo": True,
                    "puede_crear_alerta": False,
                    "cooldown_expira_en_segundos": segundos_restantes,
                    "cooldown_expira_en": cooldown_hasta.isoformat()
                }
            else:
                return {
                    "cooldown_activo": False,
                    "puede_crear_alerta": True
                }
        except Exception as e:
            print(f"⚠️  Error al parsear cooldown_hasta: {e}")
            return {
                "cooldown_activo": False,
                "puede_crear_alerta": True
            }


# --- FIN DE ENDPOINTS ---