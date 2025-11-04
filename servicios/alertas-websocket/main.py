import os
import json
from typing import Dict, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Header, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text, engine as sqlalchemy_engine
import firebase_admin
from firebase_admin import credentials, auth
from firebase_admin.exceptions import FirebaseError
from datetime import datetime
import asyncio

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

app = FastAPI(title="VigilIA WebSocket Service - Alertas en Tiempo Real")
print("✅ Servicio de WebSocket para Alertas iniciado")

# --- Configuración de CORS ---
origins = [
    "http://localhost",
    "http://localhost:8081",
    "http://localhost:8080",
    "http://localhost:19006",
    "exp://",  # Para Expo Go
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # WebSocket necesita permitir todos los orígenes
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --- FIN DE CONFIGURACIÓN DE CORS ---

# --- Gestor de Conexiones WebSocket ---
class ConnectionManager:
    def __init__(self):
        # Estructura: {firebase_uid: {websocket1, websocket2, ...}}
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.connection_metadata: Dict[WebSocket, dict] = {}

    async def connect(self, websocket: WebSocket, firebase_uid: str, user_info: dict):
        """Acepta una nueva conexión WebSocket"""
        await websocket.accept()

        if firebase_uid not in self.active_connections:
            self.active_connections[firebase_uid] = set()

        self.active_connections[firebase_uid].add(websocket)
        self.connection_metadata[websocket] = {
            "firebase_uid": firebase_uid,
            "connected_at": datetime.now(),
            "user_info": user_info
        }

        connection_count = len(self.active_connections[firebase_uid])
        print(f"✅ WebSocket conectado: {user_info.get('nombre')} ({firebase_uid})")
        print(f"   Total de conexiones activas para este usuario: {connection_count}")
        print(f"   Total de usuarios conectados: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Desconecta un WebSocket"""
        if websocket not in self.connection_metadata:
            return

        metadata = self.connection_metadata[websocket]
        firebase_uid = metadata["firebase_uid"]
        user_name = metadata["user_info"].get("nombre", "Unknown")

        if firebase_uid in self.active_connections:
            self.active_connections[firebase_uid].discard(websocket)

            # Si no quedan conexiones para este usuario, eliminar la entrada
            if not self.active_connections[firebase_uid]:
                del self.active_connections[firebase_uid]

        del self.connection_metadata[websocket]

        print(f"❌ WebSocket desconectado: {user_name} ({firebase_uid})")
        print(f"   Total de usuarios conectados: {len(self.active_connections)}")

    async def send_personal_message(self, message: dict, firebase_uid: str):
        """Envía un mensaje a un usuario específico (todas sus conexiones)"""
        if firebase_uid not in self.active_connections:
            print(f"⚠️  Usuario {firebase_uid} no tiene conexiones activas")
            return False

        connections = self.active_connections[firebase_uid].copy()
        disconnected = []

        for websocket in connections:
            try:
                await websocket.send_json(message)
            except Exception as e:
                print(f"❌ Error al enviar mensaje: {e}")
                disconnected.append(websocket)

        # Limpiar conexiones rotas
        for websocket in disconnected:
            self.disconnect(websocket)

        return len(connections) - len(disconnected) > 0

    async def broadcast_to_multiple(self, message: dict, firebase_uids: list[str]):
        """Envía un mensaje a múltiples usuarios"""
        results = {}
        for firebase_uid in firebase_uids:
            success = await self.send_personal_message(message, firebase_uid)
            results[firebase_uid] = success
        return results

    def get_connected_users(self) -> list[str]:
        """Retorna la lista de firebase_uids conectados"""
        return list(self.active_connections.keys())

    def is_user_connected(self, firebase_uid: str) -> bool:
        """Verifica si un usuario está conectado"""
        return firebase_uid in self.active_connections


manager = ConnectionManager()

# --- Función de autenticación ---
async def verify_firebase_token(authorization: str = Header(None)) -> dict:
    """Verifica el token de Firebase y retorna la información del usuario"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autorización no proporcionado"
        )

    token = authorization.split("Bearer ")[1]

    try:
        decoded_token = auth.verify_id_token(token)
        firebase_uid = decoded_token['uid']

        # Obtener información del usuario desde la BD
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT id, firebase_uid, email, nombre, rol
                    FROM usuarios
                    WHERE firebase_uid = :uid
                """),
                {"uid": firebase_uid}
            )
            user = result.fetchone()

            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Usuario no encontrado en la base de datos"
                )

            return {
                "id": user[0],
                "firebase_uid": user[1],
                "email": user[2],
                "nombre": user[3],
                "rol": user[4]
            }

    except FirebaseError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token inválido: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al verificar token: {str(e)}"
        )


# --- Endpoints WebSocket ---

@app.websocket("/ws/alertas")
async def websocket_alertas(websocket: WebSocket, token: str = None):
    """
    WebSocket para recibir alertas en tiempo real
    Query param: ?token=<firebase_id_token>
    """

    # Verificar token de autenticación
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        decoded_token = auth.verify_id_token(token)
        firebase_uid = decoded_token['uid']

        # Obtener información del usuario
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT id, firebase_uid, email, nombre, rol
                    FROM usuarios
                    WHERE firebase_uid = :uid
                """),
                {"uid": firebase_uid}
            )
            user = result.fetchone()

            if not user:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return

            user_info = {
                "id": user[0],
                "firebase_uid": user[1],
                "email": user[2],
                "nombre": user[3],
                "rol": user[4]
            }

        # Solo permitir cuidadores
        if user_info["rol"] != "cuidador":
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        # Conectar el WebSocket
        await manager.connect(websocket, firebase_uid, user_info)

        # Enviar mensaje de bienvenida
        await websocket.send_json({
            "tipo": "conexion_exitosa",
            "mensaje": f"Conectado al servicio de alertas en tiempo real",
            "timestamp": datetime.now().isoformat(),
            "usuario": user_info["nombre"]
        })

        # Mantener la conexión abierta y escuchar mensajes (heartbeat)
        try:
            while True:
                # Recibir mensajes del cliente (para mantener la conexión viva)
                data = await websocket.receive_text()

                # Si recibe "ping", responder "pong"
                if data == "ping":
                    await websocket.send_json({"tipo": "pong", "timestamp": datetime.now().isoformat()})

        except WebSocketDisconnect:
            manager.disconnect(websocket)

    except FirebaseError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
    except Exception as e:
        print(f"❌ Error en WebSocket: {e}")
        try:
            manager.disconnect(websocket)
        except:
            pass


# --- Endpoints HTTP para enviar notificaciones ---

@app.post("/internal/notify-alert")
async def notify_alert(
    alert_data: dict,
    x_internal_key: str = Header(None, alias="X-Internal-Key")
):
    """
    Endpoint interno para notificar nuevas alertas a través de WebSocket.
    Solo puede ser llamado por otros servicios internos con la clave correcta.
    """
    # Verificar clave interna (opcional: implementar autenticación entre servicios)
    INTERNAL_KEY = os.environ.get("INTERNAL_API_KEY", "").strip()

    if INTERNAL_KEY and x_internal_key and x_internal_key.strip() != INTERNAL_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Clave interna inválida"
        )

    # Obtener cuidadores asociados al adulto mayor
    adulto_mayor_id = alert_data.get("adulto_mayor_id")

    if not adulto_mayor_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="adulto_mayor_id es requerido"
        )

    try:
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT u.firebase_uid, u.nombre
                    FROM cuidadores_adultos_mayores cam
                    JOIN usuarios u ON cam.usuario_id = u.id
                    WHERE cam.adulto_mayor_id = :adulto_mayor_id
                """),
                {"adulto_mayor_id": adulto_mayor_id}
            )
            cuidadores = result.fetchall()

        if not cuidadores:
            return {
                "success": True,
                "message": "No hay cuidadores conectados",
                "notified_count": 0
            }

        # Construir mensaje de notificación
        mensaje = {
            "tipo": "nueva_alerta",
            "alerta": alert_data,
            "timestamp": datetime.now().isoformat()
        }

        # Enviar a todos los cuidadores
        firebase_uids = [c[0] for c in cuidadores]
        results = await manager.broadcast_to_multiple(mensaje, firebase_uids)

        notified_count = sum(1 for success in results.values() if success)

        print(f"📢 Alerta enviada a {notified_count}/{len(cuidadores)} cuidadores conectados")

        return {
            "success": True,
            "message": f"Notificación enviada a {notified_count} cuidadores",
            "total_cuidadores": len(cuidadores),
            "notified_count": notified_count,
            "connected_users": manager.get_connected_users()
        }

    except Exception as e:
        print(f"❌ Error al notificar alerta: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al enviar notificación: {str(e)}"
        )


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "alertas-websocket",
        "connected_users": len(manager.get_connected_users()),
        "timestamp": datetime.now().isoformat()
    }


@app.get("/stats")
async def get_stats():
    """Estadísticas del servicio"""
    return {
        "connected_users_count": len(manager.get_connected_users()),
        "connected_firebase_uids": manager.get_connected_users(),
        "timestamp": datetime.now().isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
