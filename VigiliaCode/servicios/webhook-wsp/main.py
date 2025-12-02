# -*- coding: utf-8 -*-
import os
from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, constr
import httpx
from datetime import datetime
import json
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
    notification_type: str  # 'fall_alert', 'help_alert', 'reminder', 'welcome'
    title: str
    body: str
    parameters: dict = {}  # Parámetros adicionales para el template

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
        "Content-Type": "application/json; charset=utf-8"
    }

    # Serializar el payload como JSON con UTF-8 y codificar como bytes
    payload_json = json.dumps(payload, ensure_ascii=False).encode('utf-8')

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                WHATSAPP_API_URL,
                content=payload_json,
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
        "Content-Type": "application/json; charset=utf-8"
    }

    # Serializar el payload como JSON con UTF-8 y codificar como bytes
    payload_json = json.dumps(payload, ensure_ascii=False).encode('utf-8')

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                WHATSAPP_API_URL,
                content=payload_json,
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

# --- Funciones Auxiliares ---
def get_template_config(notification_type: str, parameters: dict):
    """
    Mapea el tipo de notificación al template de WhatsApp correspondiente.

    Templates disponibles:
    - alertacaidatest: Alerta de caída detectada (APROBADO)
    - welcome: Mensaje de bienvenida (PENDIENTE CREACIÓN)
    - help_alert: Alerta de ayuda (PENDIENTE CREACIÓN)
    - reminder: Recordatorios (PENDIENTE CREACIÓN)
    """

    templates = {
        "fall_alert": {
            "name": "alertacaidatest",
            "language": "es_CL",
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {
                            "type": "text",
                            "parameter_name": "nombre",
                            "text": parameters.get("nombre_adulto_mayor", "Adulto Mayor")
                        }
                    ]
                }
            ]
        },
        "help_alert": {
            # Template para alertas de ayuda (boton de panico)
            # Cuando alertasayudastest este aprobada en Meta, cambiar a:
            # "name": "alertasayudastest",
            # Por ahora usamos alertacaidatest como fallback
            "name": "alertasayudastest",  # Cambiado para usar la plantilla correcta
            "language": "es_CL",
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {
                            "type": "text",
                            "parameter_name": "nombre",
                            "text": parameters.get("nombre_adulto_mayor", "Adulto Mayor")
                        }
                    ]
                }
            ]
        },
        # Templates futuros (usar hello_world hasta que esten aprobados)
        "welcome": {
            "name": "hello_world",  # TODO: Reemplazar con template de bienvenida
            "language": "en_US",
            "components": []
        },
        "reminder": {
            "name": "hello_world",  # TODO: Reemplazar con template de recordatorio
            "language": "en_US",
            "components": []
        }
    }

    return templates.get(notification_type, templates["welcome"])

# --- ENDPOINT: /send-notification (Enviar notificación de recordatorio/alerta) ---
@app.post("/send-notification", dependencies=[Depends(verify_api_key)])
async def send_notification(notification: NotificationRequest):
    """
    Envía una notificación de recordatorio o alerta por WhatsApp.
    Este endpoint es para uso interno de la plataforma VigilIA.

    Tipos soportados:
    - fall_alert: Alerta de caída (usa template 'alertacaidatest')
    - welcome: Mensaje de bienvenida
    - help_alert: Alerta de ayuda
    - reminder: Recordatorios
    """
    if not WHATSAPP_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="WHATSAPP_TOKEN no configurado"
        )

    print(f"📤 Enviando notificación {notification.notification_type} a {notification.phone_number}")
    print(f"📝 Tipo: {notification.notification_type} - {notification.title}")
    print(f"📝 Contenido: {notification.body}")
    print(f"📝 Parámetros: {notification.parameters}")

    # Obtener configuración del template según el tipo
    template_config = get_template_config(notification.notification_type, notification.parameters)

    # Construir el payload
    payload = {
        "messaging_product": "whatsapp",
        "to": notification.phone_number,
        "type": "template",
        "template": {
            "name": template_config["name"],
            "language": {
                "code": template_config["language"]
            }
        }
    }

    # Agregar componentes si existen
    if template_config.get("components"):
        payload["template"]["components"] = template_config["components"]

    # LOG DETALLADO DEL PAYLOAD
    import json
    print("=" * 80)
    print("📤 PAYLOAD COMPLETO A ENVIAR A META:")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    print("=" * 80)
    print(f"🔗 URL: {WHATSAPP_API_URL}")
    print(f"🔑 Token (primeros 20): {WHATSAPP_TOKEN[:20]}...")
    print(f"📏 Token length: {len(WHATSAPP_TOKEN)} bytes")
    print("=" * 80)

    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json; charset=utf-8"
    }

    # Serializar el payload como JSON con UTF-8 y codificar como bytes
    payload_json = json.dumps(payload, ensure_ascii=False).encode('utf-8')

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                WHATSAPP_API_URL,
                content=payload_json,
                headers=headers,
                timeout=30.0
            )

            if response.status_code == 200:
                result = response.json()
                print(f"✅ Notificación enviada exitosamente: {result}")
                return {
                    "status": "sent",
                    "notification_type": notification.notification_type,
                    "template_used": template_config["name"],
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
