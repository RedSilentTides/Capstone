import os
from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, constr
import httpx
from datetime import datetime
# Importar el middleware de CORS
from fastapi.middleware.cors import CORSMiddleware

# --- Configuración de WhatsApp API ---
WHATSAPP_TOKEN = os.environ.get("WHATSAPP_TOKEN", "").strip()
WHATSAPP_PHONE_ID = os.environ.get("WHATSAPP_PHONE_ID", "885336931326209").strip()
WHATSAPP_API_VERSION = "v22.0"
WHATSAPP_API_URL = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_ID}/messages"

# --- Configuración de Seguridad ---
API_KEY = os.environ.get("API_KEY", "").strip()
WEBHOOK_VERIFY_TOKEN = os.environ.get("WEBHOOK_VERIFY_TOKEN", "").strip()

# Debug: Imprimir configuración al iniciar (solo primeros caracteres por seguridad)
print(f"🔑 API_KEY configurado: {'SÍ (' + API_KEY[:4] + '...)' if API_KEY else 'NO - VACÍO'}")
print(f"📱 WHATSAPP_TOKEN configurado: {'SÍ (' + WHATSAPP_TOKEN[:10] + '...)' if WHATSAPP_TOKEN else 'NO - VACÍO'}")
print(f"📞 WHATSAPP_PHONE_ID: {WHATSAPP_PHONE_ID}")
print(f"🔐 WEBHOOK_VERIFY_TOKEN configurado: {'SÍ (' + WEBHOOK_VERIFY_TOKEN + ')' if WEBHOOK_VERIFY_TOKEN else 'NO - VACÍO'}")

# Inicializa FastAPI
app = FastAPI(title="VigilIA WhatsApp Webhook")

# --- Configuración de CORS ---
origins = [
    "http://localhost",
    "http://localhost:8081",
    "http://localhost:8080",
    "http://localhost:19006",
    # Añade aquí la URL de tu frontend desplegado en producción
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
class WhatsAppTemplateMessage(BaseModel):
    to: constr(min_length=10, max_length=15)  # Número de teléfono
    template_name: str = "hello_world"
    language_code: str = "en_US"

class WhatsAppTextMessage(BaseModel):
    to: constr(min_length=10, max_length=15)  # Número de teléfono
    message: constr(min_length=1)  # Mensaje de texto

class NotificationRequest(BaseModel):
    """Modelo para enviar notificaciones de recordatorios/alertas"""
    phone_number: constr(min_length=10, max_length=15)
    notification_type: str  # 'reminder', 'alert', 'fall_detection'
    title: str
    body: str

# --- Seguridad con API Key ---
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(api_key: str = Depends(api_key_header)):
    """
    Dependencia FastAPI: Verifica que el API Key sea válido.
    """
    print(f"🔐 Verificando API Key recibida: {api_key[:4] if api_key else 'None'}...")
    print(f"🔐 API Key esperada: {API_KEY[:4]}...")

    if not API_KEY:
        print("⚠️ ADVERTENCIA: API_KEY no configurada en variables de entorno")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Servicio no configurado correctamente"
        )

    if api_key != API_KEY:
        print(f"❌ API Key NO coincide! Recibida: '{api_key}' vs Esperada: '{API_KEY}'")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key inválida",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    print("✅ API Key válida")
    return api_key

# --- Endpoints de la API ---

# --- ENDPOINT: / (Raíz, público) ---
@app.get("/")
def read_root():
    """Endpoint raíz para verificar que el webhook está en línea."""
    return {
        "status": "VigilIA WhatsApp Webhook está en línea",
        "timestamp": datetime.utcnow().isoformat()
    }

# --- ENDPOINT: /health (Health Check para GCP) ---
@app.get("/health")
def health_check():
    """Health check endpoint para Cloud Run."""
    return {"status": "healthy", "service": "whatsapp-webhook"}

# --- ENDPOINT: /webhook (Verificación de webhook de Meta) ---
@app.get("/webhook")
async def verify_webhook(request: Request):
    """
    Endpoint para verificación del webhook por parte de Meta.
    Meta envía: hub.mode, hub.verify_token, hub.challenge
    """
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    print(f"Webhook verification attempt: mode={mode}, token={token}")
    print(f"🔍 Comparando tokens:")
    print(f"   Recibido: '{token}' (len={len(token) if token else 0})")
    print(f"   Esperado: '{WEBHOOK_VERIFY_TOKEN}' (len={len(WEBHOOK_VERIFY_TOKEN)})")
    print(f"   Mode match: {mode == 'subscribe'}")
    print(f"   Token match: {token == WEBHOOK_VERIFY_TOKEN}")

    if mode == "subscribe" and token == WEBHOOK_VERIFY_TOKEN:
        print("✅ Webhook verificado exitosamente")
        return int(challenge)
    else:
        print("❌ Webhook verification failed")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification token mismatch")

# --- ENDPOINT: /webhook (Recibir mensajes de WhatsApp) ---
@app.post("/webhook")
async def receive_webhook(request: Request):
    """
    Endpoint para recibir webhooks de Meta (mensajes entrantes, estados, etc.)
    """
    try:
        data = await request.json()
        print(f"📨 Webhook recibido: {data}")

        # Aquí puedes procesar mensajes entrantes, estados de entrega, etc.
        # Por ahora solo logueamos

        return {"status": "received"}
    except Exception as e:
        print(f"❌ Error procesando webhook: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

# --- ENDPOINT: /send-template (Enviar mensaje de plantilla) ---
@app.post("/send-template", dependencies=[Depends(verify_api_key)])
async def send_template_message(message: WhatsAppTemplateMessage):
    """
    Envía un mensaje usando una plantilla de WhatsApp Business.
    Requiere API Key para autenticación.
    """
    if not WHATSAPP_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="WHATSAPP_TOKEN no configurado"
        )

    print(f"📤 Enviando mensaje de plantilla a {message.to}")

    payload = {
        "messaging_product": "whatsapp",
        "to": message.to,
        "type": "template",
        "template": {
            "name": message.template_name,
            "language": {
                "code": message.language_code
            }
        }
    }

    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                WHATSAPP_API_URL,
                json=payload,
                headers=headers,
                timeout=30.0
            )

            if response.status_code == 200:
                result = response.json()
                print(f"✅ Mensaje enviado exitosamente: {result}")
                return {
                    "status": "sent",
                    "message_id": result.get("messages", [{}])[0].get("id"),
                    "response": result
                }
            else:
                print(f"❌ Error al enviar mensaje: {response.status_code} - {response.text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Error de WhatsApp API: {response.text}"
                )

    except httpx.RequestError as e:
        print(f"❌ Error de conexión: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Error al conectar con WhatsApp API: {str(e)}"
        )

# --- ENDPOINT: /send-text (Enviar mensaje de texto) ---
@app.post("/send-text", dependencies=[Depends(verify_api_key)])
async def send_text_message(message: WhatsAppTextMessage):
    """
    Envía un mensaje de texto simple a través de WhatsApp.
    Requiere API Key para autenticación.
    """
    if not WHATSAPP_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="WHATSAPP_TOKEN no configurado"
        )

    print(f"📤 Enviando mensaje de texto a {message.to}")

    payload = {
        "messaging_product": "whatsapp",
        "to": message.to,
        "type": "text",
        "text": {
            "body": message.message
        }
    }

    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                WHATSAPP_API_URL,
                json=payload,
                headers=headers,
                timeout=30.0
            )

            if response.status_code == 200:
                result = response.json()
                print(f"✅ Mensaje enviado exitosamente: {result}")
                return {
                    "status": "sent",
                    "message_id": result.get("messages", [{}])[0].get("id"),
                    "response": result
                }
            else:
                print(f"❌ Error al enviar mensaje: {response.status_code} - {response.text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Error de WhatsApp API: {response.text}"
                )

    except httpx.RequestError as e:
        print(f"❌ Error de conexión: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Error al conectar con WhatsApp API: {str(e)}"
        )

# --- ENDPOINT: /send-notification (Enviar notificación de recordatorio/alerta) ---
@app.post("/send-notification", dependencies=[Depends(verify_api_key)])
async def send_notification(notification: NotificationRequest):
    """
    Envía una notificación de recordatorio o alerta por WhatsApp.
    Este endpoint es para uso interno de la plataforma VigilIA.
    """
    if not WHATSAPP_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="WHATSAPP_TOKEN no configurado"
        )

    print(f"📤 Enviando notificación {notification.notification_type} a {notification.phone_number}")

    # TEMPORAL: Usar template hello_world para números de test
    # TODO: Reemplazar con templates personalizados una vez aprobados por Meta
    # Templates requeridos: alerta_caida, solicitud_ayuda, recordatorio_medicamento

    # Por ahora usamos hello_world que funciona con números de test
    payload = {
        "messaging_product": "whatsapp",
        "to": notification.phone_number,
        "type": "template",
        "template": {
            "name": "hello_world",
            "language": {
                "code": "en_US"
            }
        }
    }

    # Log del mensaje que se enviaría con template personalizado
    print(f"📝 Tipo: {notification.notification_type} - {notification.title}")
    print(f"📝 Contenido: {notification.body}")

    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                WHATSAPP_API_URL,
                json=payload,
                headers=headers,
                timeout=30.0
            )

            if response.status_code == 200:
                result = response.json()
                print(f"✅ Notificación enviada exitosamente: {result}")
                return {
                    "status": "sent",
                    "notification_type": notification.notification_type,
                    "message_id": result.get("messages", [{}])[0].get("id"),
                    "response": result
                }
            else:
                print(f"❌ Error al enviar notificación: {response.status_code} - {response.text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Error de WhatsApp API: {response.text}"
                )

    except httpx.RequestError as e:
        print(f"❌ Error de conexión: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Error al conectar con WhatsApp API: {str(e)}"
        )

# --- FIN DE ENDPOINTS ---
