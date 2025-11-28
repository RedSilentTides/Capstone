# -*- coding: utf-8 -*-
"""
Servicio de Notificaciones por Email - VigilIA
Usando SendGrid API para envio de emails transaccionales
"""

from fastapi import FastAPI, HTTPException, Header, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import os
import logging
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, To, From, Content

# Configuracion de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Inicializar FastAPI
app = FastAPI(
    title="VigilIA - Email Notification Service",
    description="Servicio de notificaciones por email para alertas y recordatorios",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Variables de entorno (con strip para eliminar \r\n)
SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "").strip() or None
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "").strip() or None
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "alertas@mivigilia.cl").strip()
SENDER_NAME = os.getenv("SENDER_NAME", "VigilIA - Sistema de Monitoreo").strip()

# Validar configuracion
if not SENDGRID_API_KEY:
    logger.warning("SENDGRID_API_KEY no configurada")
if not INTERNAL_API_KEY:
    logger.warning("INTERNAL_API_KEY no configurada")

# Cliente de SendGrid
sg_client = SendGridAPIClient(SENDGRID_API_KEY) if SENDGRID_API_KEY else None


# ==================== MODELOS DE DATOS ====================

class EmailRecipient(BaseModel):
    """Destinatario de email"""
    email: EmailStr
    name: Optional[str] = None


class AlertaCaidaEmail(BaseModel):
    """Datos para email de alerta de caida"""
    tipo: str = Field(default="caida", description="Tipo de alerta: caida")
    destinatarios: List[EmailRecipient]
    adulto_mayor_nombre: str
    timestamp: datetime
    url_video: Optional[str] = None
    dispositivo_id: Optional[int] = None
    detalles_adicionales: Optional[Dict[str, Any]] = None


class AlertaAyudaEmail(BaseModel):
    """Datos para email de solicitud de ayuda"""
    tipo: str = Field(default="ayuda", description="Tipo de alerta: ayuda")
    destinatarios: List[EmailRecipient]
    adulto_mayor_nombre: str
    timestamp: datetime
    mensaje_adicional: Optional[str] = None
    detalles_adicionales: Optional[Dict[str, Any]] = None


class RecordatorioEmail(BaseModel):
    """Datos para email de recordatorio"""
    tipo: str = Field(default="recordatorio", description="Tipo: recordatorio")
    destinatarios: List[EmailRecipient]
    adulto_mayor_nombre: str
    titulo_recordatorio: str
    descripcion: Optional[str] = None
    fecha_hora_programada: datetime
    tipo_recordatorio: str = "medicamento"  # medicamento, cita_medica, ejercicio, etc.


class EmailGenerico(BaseModel):
    """Email generico personalizable"""
    destinatarios: List[EmailRecipient]
    asunto: str
    contenido_html: str
    contenido_texto: Optional[str] = None


class BienvenidaEmail(BaseModel):
    """Datos para email de bienvenida"""
    destinatarios: List[EmailRecipient]
    nombre_usuario: str
    rol: str = "usuario"  # cuidador, adulto_mayor


# ==================== FUNCIONES AUXILIARES ====================

def verificar_internal_api_key(x_internal_key: Optional[str] = Header(None)):
    """Middleware para verificar la API key interna"""
    if not INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servicio no configurado correctamente"
        )
    if not x_internal_key or x_internal_key != INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key invalida o faltante"
        )


def generar_html_caida(data: AlertaCaidaEmail) -> str:
    """Genera HTML para email de alerta de caida"""
    timestamp_str = data.timestamp.strftime("%d/%m/%Y a las %H:%M:%S")

    video_section = ""
    if data.url_video:
        video_section = f"""
        <div style="margin: 20px 0;">
            <a href="{data.url_video}"
               style="display: inline-block; padding: 12px 24px; background-color: #1976d2;
                      color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                📹 Ver Video de la Alerta
            </a>
        </div>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 0;">
            <!-- Header -->
            <div style="background-color: #d32f2f; padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">
                    🚨 ALERTA DE CAIDA DETECTADA
                </h1>
            </div>

            <!-- Content -->
            <div style="padding: 30px;">
                <p style="font-size: 16px; line-height: 1.6; color: #333;">
                    Estimado/a cuidador/a,
                </p>
                <p style="font-size: 16px; line-height: 1.6; color: #333;">
                    El sistema <strong>VigilIA</strong> ha detectado una posible caida de
                    <strong>{data.adulto_mayor_nombre}</strong>.
                </p>

                <!-- Alert Box -->
                <div style="background-color: #ffebee; border-left: 4px solid #d32f2f;
                            padding: 20px; margin: 25px 0; border-radius: 4px;">
                    <p style="margin: 0 0 10px 0; color: #c62828; font-weight: bold; font-size: 16px;">
                        Informacion de la alerta:
                    </p>
                    <ul style="margin: 10px 0; padding-left: 20px; color: #555;">
                        <li style="margin-bottom: 8px;"><strong>Adulto Mayor:</strong> {data.adulto_mayor_nombre}</li>
                        <li style="margin-bottom: 8px;"><strong>Fecha y Hora:</strong> {timestamp_str}</li>
                        <li style="margin-bottom: 8px;"><strong>Tipo de Alerta:</strong> Caida Detectada</li>
                        {f'<li style="margin-bottom: 8px;"><strong>Dispositivo ID:</strong> {data.dispositivo_id}</li>' if data.dispositivo_id else ''}
                    </ul>
                </div>

                {video_section}

                <div style="background-color: #fff3e0; border-radius: 4px; padding: 15px; margin: 25px 0;">
                    <p style="margin: 0; color: #e65100; font-size: 14px;">
                        ⚠️ <strong>Accion requerida:</strong> Por favor, verifique el estado de
                        {data.adulto_mayor_nombre} lo antes posible y confirme la alerta desde la aplicacion.
                    </p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f5f5f5; padding: 20px; text-align: center;
                        border-top: 1px solid #e0e0e0;">
                <p style="margin: 0 0 10px 0; color: #757575; font-size: 13px;">
                    Este es un mensaje automatico del sistema VigilIA
                </p>
                <p style="margin: 0; color: #9e9e9e; font-size: 12px;">
                    Por favor, no responda a este correo
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    return html


def generar_html_ayuda(data: AlertaAyudaEmail) -> str:
    """Genera HTML para email de solicitud de ayuda"""
    timestamp_str = data.timestamp.strftime("%d/%m/%Y a las %H:%M:%S")

    mensaje_section = ""
    if data.mensaje_adicional:
        mensaje_section = f"""
        <div style="background-color: #e3f2fd; border-radius: 4px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 5px 0; color: #1565c0; font-weight: bold;">Mensaje:</p>
            <p style="margin: 0; color: #424242;">{data.mensaje_adicional}</p>
        </div>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 0;">
            <!-- Header -->
            <div style="background-color: #f57c00; padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">
                    🆘 SOLICITUD DE AYUDA
                </h1>
            </div>

            <!-- Content -->
            <div style="padding: 30px;">
                <p style="font-size: 16px; line-height: 1.6; color: #333;">
                    Estimado/a cuidador/a,
                </p>
                <p style="font-size: 16px; line-height: 1.6; color: #333;">
                    <strong>{data.adulto_mayor_nombre}</strong> ha solicitado ayuda a traves del
                    sistema <strong>VigilIA</strong>.
                </p>

                <!-- Alert Box -->
                <div style="background-color: #fff3e0; border-left: 4px solid #f57c00;
                            padding: 20px; margin: 25px 0; border-radius: 4px;">
                    <p style="margin: 0 0 10px 0; color: #e65100; font-weight: bold; font-size: 16px;">
                        Informacion de la solicitud:
                    </p>
                    <ul style="margin: 10px 0; padding-left: 20px; color: #555;">
                        <li style="margin-bottom: 8px;"><strong>Adulto Mayor:</strong> {data.adulto_mayor_nombre}</li>
                        <li style="margin-bottom: 8px;"><strong>Fecha y Hora:</strong> {timestamp_str}</li>
                        <li style="margin-bottom: 8px;"><strong>Tipo de Alerta:</strong> Solicitud de Ayuda</li>
                    </ul>
                </div>

                {mensaje_section}

                <div style="background-color: #ffebee; border-radius: 4px; padding: 15px; margin: 25px 0;">
                    <p style="margin: 0; color: #c62828; font-size: 14px;">
                        ⚠️ <strong>Accion inmediata requerida:</strong> Por favor, contacte a
                        {data.adulto_mayor_nombre} lo antes posible para atender su solicitud.
                    </p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f5f5f5; padding: 20px; text-align: center;
                        border-top: 1px solid #e0e0e0;">
                <p style="margin: 0 0 10px 0; color: #757575; font-size: 13px;">
                    Este es un mensaje automatico del sistema VigilIA
                </p>
                <p style="margin: 0; color: #9e9e9e; font-size: 12px;">
                    Por favor, no responda a este correo
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    return html


def generar_html_recordatorio(data: RecordatorioEmail) -> str:
    """Genera HTML para email de recordatorio"""
    fecha_str = data.fecha_hora_programada.strftime("%d/%m/%Y")
    hora_str = data.fecha_hora_programada.strftime("%H:%M")

    # Iconos segun tipo de recordatorio
    iconos = {
        "medicamento": "💊",
        "cita_medica": "🏥",
        "ejercicio": "🏃",
        "hidratacion": "💧",
        "comida": "🍽️",
        "consejo_salud": "💚",
        "otro": "📌"
    }
    icono = iconos.get(data.tipo_recordatorio, "📌")

    descripcion_section = ""
    if data.descripcion:
        descripcion_section = f"""
        <div style="background-color: #f5f5f5; border-radius: 4px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 5px 0; color: #424242; font-weight: bold;">Detalles:</p>
            <p style="margin: 0; color: #616161;">{data.descripcion}</p>
        </div>
        """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 0;">
            <!-- Header -->
            <div style="background-color: #4caf50; padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">
                    {icono} RECORDATORIO
                </h1>
            </div>

            <!-- Content -->
            <div style="padding: 30px;">
                <p style="font-size: 16px; line-height: 1.6; color: #333;">
                    Hola <strong>{data.adulto_mayor_nombre}</strong>,
                </p>
                <p style="font-size: 16px; line-height: 1.6; color: #333;">
                    Este es tu recordatorio programado desde <strong>VigilIA</strong>.
                </p>

                <!-- Reminder Box -->
                <div style="background-color: #e8f5e9; border-left: 4px solid #4caf50;
                            padding: 20px; margin: 25px 0; border-radius: 4px;">
                    <h2 style="margin: 0 0 15px 0; color: #2e7d32; font-size: 20px;">
                        {data.titulo_recordatorio}
                    </h2>
                    <ul style="margin: 10px 0; padding-left: 20px; color: #555;">
                        <li style="margin-bottom: 8px;"><strong>Fecha:</strong> {fecha_str}</li>
                        <li style="margin-bottom: 8px;"><strong>Hora:</strong> {hora_str}</li>
                        <li style="margin-bottom: 8px;"><strong>Tipo:</strong> {data.tipo_recordatorio.replace('_', ' ').title()}</li>
                    </ul>
                </div>

                {descripcion_section}

                <div style="background-color: #e3f2fd; border-radius: 4px; padding: 15px; margin: 25px 0;">
                    <p style="margin: 0; color: #1565c0; font-size: 14px;">
                        💡 <strong>Recuerda:</strong> Puedes confirmar este recordatorio desde la
                        aplicacion VigilIA en tu dispositivo.
                    </p>
                </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f5f5f5; padding: 20px; text-align: center;
                        border-top: 1px solid #e0e0e0;">
                <p style="margin: 0 0 10px 0; color: #757575; font-size: 13px;">
                    Este es un mensaje automatico del sistema VigilIA
                </p>
                <p style="margin: 0; color: #9e9e9e; font-size: 12px;">
                    Por favor, no responda a este correo
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    return html


def generar_html_bienvenida(data: BienvenidaEmail) -> str:
    """Genera HTML para email de bienvenida"""
    rol_texto = "cuidador" if data.rol == "cuidador" else "usuario"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 0;">
            <!-- Header -->
            <div style="background-color: #7c3aed; padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">
                    👋 ¡Bienvenido/a a VigilIA!
                </h1>
            </div>

            <!-- Content -->
            <div style="padding: 30px;">
                <p style="font-size: 16px; line-height: 1.6; color: #333;">
                    Hola <strong>{data.nombre_usuario}</strong>,
                </p>
                <p style="font-size: 16px; line-height: 1.6; color: #333;">
                    ¡Te damos la bienvenida a <strong>VigilIA</strong>, tu plataforma de monitoreo y cuidado para adultos mayores!
                </p>

                <!-- Welcome Box -->
                <div style="background-color: #f3f0ff; border-left: 4px solid #7c3aed;
                            padding: 20px; margin: 25px 0; border-radius: 4px;">
                    <h2 style="margin: 0 0 15px 0; color: #7c3aed; font-size: 20px;">
                        ¿Qué puedes hacer con VigilIA?
                    </h2>
                    <ul style="margin: 10px 0; padding-left: 20px; color: #555;">
                        <li style="margin-bottom: 8px;">📱 Recibir alertas en tiempo real sobre eventos importantes</li>
                        <li style="margin-bottom: 8px;">💊 Configurar recordatorios de medicamentos y citas médicas</li>
                        <li style="margin-bottom: 8px;">👥 Conectarte con familiares y cuidadores</li>
                        <li style="margin-bottom: 8px;">📊 Monitorear el bienestar de tus seres queridos</li>
                    </ul>
                </div>

                <p style="font-size: 16px; line-height: 1.6; color: #333;">
                    Tu cuenta ha sido creada exitosamente como <strong>{rol_texto}</strong>.
                    Ya puedes iniciar sesión en la aplicación y comenzar a utilizar todas las funcionalidades.
                </p>

                <div style="background-color: #e6f4fe; border-radius: 4px; padding: 15px; margin: 25px 0;">
                    <p style="margin: 0; color: #1B4965; font-size: 14px;">
                        💡 <strong>Primer paso:</strong> Descarga la aplicación VigilIA en tu dispositivo móvil
                        o accede desde <a href="https://app.mivigilia.cl" style="color: #7c3aed; text-decoration: none;">app.mivigilia.cl</a>
                    </p>
                </div>

                <p style="font-size: 14px; line-height: 1.6; color: #666; margin-top: 20px;">
                    Si tienes alguna pregunta o necesitas ayuda, no dudes en contactarnos.
                </p>
            </div>

            <!-- Footer -->
            <div style="background-color: #f5f5f5; padding: 20px; text-align: center;
                        border-top: 1px solid #e0e0e0;">
                <p style="margin: 0 0 10px 0; color: #757575; font-size: 13px;">
                    Gracias por confiar en VigilIA
                </p>
                <p style="margin: 0; color: #9e9e9e; font-size: 12px;">
                    Este es un mensaje automático. Por favor, no responda a este correo
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    return html


async def enviar_email(
    destinatarios: List[EmailRecipient],
    asunto: str,
    contenido_html: str,
    contenido_texto: Optional[str] = None
) -> Dict[str, Any]:
    """
    Funcion auxiliar para enviar emails usando SendGrid
    """
    if not sg_client:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SendGrid no esta configurado"
        )

    resultados = []
    errores = []

    for destinatario in destinatarios:
        try:
            # Crear el mensaje
            message = Mail(
                from_email=From(SENDER_EMAIL, SENDER_NAME),
                to_emails=To(destinatario.email, destinatario.name),
                subject=asunto,
                html_content=Content("text/html", contenido_html)
            )

            # Agregar contenido de texto plano si existe
            if contenido_texto:
                message.plain_text_content = Content("text/plain", contenido_texto)

            # Enviar
            response = sg_client.send(message)

            resultados.append({
                "email": destinatario.email,
                "status": "enviado",
                "status_code": response.status_code
            })

            logger.info(f"Email enviado a {destinatario.email} - Status: {response.status_code}")

        except Exception as e:
            error_msg = str(e)
            errores.append({
                "email": destinatario.email,
                "status": "error",
                "error": error_msg
            })
            logger.error(f"Error enviando email a {destinatario.email}: {error_msg}")

    return {
        "total_destinatarios": len(destinatarios),
        "enviados_exitosamente": len(resultados),
        "errores": len(errores),
        "detalles": resultados + errores
    }


# ==================== ENDPOINTS ====================

@app.get("/")
async def root():
    """Endpoint de health check"""
    return {
        "service": "VigilIA - Email Notification Service",
        "status": "running",
        "sendgrid_configured": sg_client is not None,
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    """Health check detallado"""
    return {
        "status": "healthy",
        "sendgrid_configured": sg_client is not None,
        "internal_api_configured": INTERNAL_API_KEY is not None,
        "sender_email": SENDER_EMAIL,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post("/send/alerta-caida", dependencies=[Depends(verificar_internal_api_key)])
async def enviar_alerta_caida(data: AlertaCaidaEmail):
    """
    Envia email de alerta de caida detectada
    Requiere X-Internal-Key header
    """
    try:
        asunto = f"🚨 ALERTA: Caida Detectada - {data.adulto_mayor_nombre}"
        contenido_html = generar_html_caida(data)

        resultado = await enviar_email(
            destinatarios=data.destinatarios,
            asunto=asunto,
            contenido_html=contenido_html
        )

        return {
            "success": True,
            "tipo": "alerta_caida",
            "adulto_mayor": data.adulto_mayor_nombre,
            "resultado": resultado
        }

    except Exception as e:
        logger.error(f"Error en enviar_alerta_caida: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al enviar email: {str(e)}"
        )


@app.post("/send/alerta-ayuda", dependencies=[Depends(verificar_internal_api_key)])
async def enviar_alerta_ayuda(data: AlertaAyudaEmail):
    """
    Envia email de solicitud de ayuda
    Requiere X-Internal-Key header
    """
    try:
        asunto = f"🆘 SOLICITUD DE AYUDA - {data.adulto_mayor_nombre}"
        contenido_html = generar_html_ayuda(data)

        resultado = await enviar_email(
            destinatarios=data.destinatarios,
            asunto=asunto,
            contenido_html=contenido_html
        )

        return {
            "success": True,
            "tipo": "alerta_ayuda",
            "adulto_mayor": data.adulto_mayor_nombre,
            "resultado": resultado
        }

    except Exception as e:
        logger.error(f"Error en enviar_alerta_ayuda: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al enviar email: {str(e)}"
        )


@app.post("/send/recordatorio", dependencies=[Depends(verificar_internal_api_key)])
async def enviar_recordatorio(data: RecordatorioEmail):
    """
    Envia email de recordatorio
    Requiere X-Internal-Key header
    """
    try:
        asunto = f"📌 Recordatorio: {data.titulo_recordatorio}"
        contenido_html = generar_html_recordatorio(data)

        resultado = await enviar_email(
            destinatarios=data.destinatarios,
            asunto=asunto,
            contenido_html=contenido_html
        )

        return {
            "success": True,
            "tipo": "recordatorio",
            "adulto_mayor": data.adulto_mayor_nombre,
            "titulo": data.titulo_recordatorio,
            "resultado": resultado
        }

    except Exception as e:
        logger.error(f"Error en enviar_recordatorio: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al enviar email: {str(e)}"
        )


@app.post("/send/bienvenida", dependencies=[Depends(verificar_internal_api_key)])
async def enviar_bienvenida(data: BienvenidaEmail):
    """
    Envia email de bienvenida a nuevos usuarios
    Requiere X-Internal-Key header
    """
    try:
        asunto = "¡Bienvenido/a a VigilIA! 👋"
        contenido_html = generar_html_bienvenida(data)

        resultado = await enviar_email(
            destinatarios=data.destinatarios,
            asunto=asunto,
            contenido_html=contenido_html
        )

        return {
            "success": True,
            "tipo": "bienvenida",
            "usuario": data.nombre_usuario,
            "rol": data.rol,
            "resultado": resultado
        }

    except Exception as e:
        logger.error(f"Error en enviar_bienvenida: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al enviar email: {str(e)}"
        )


@app.post("/send/generico", dependencies=[Depends(verificar_internal_api_key)])
async def enviar_email_generico(data: EmailGenerico):
    """
    Envia email generico personalizado
    Requiere X-Internal-Key header
    """
    try:
        resultado = await enviar_email(
            destinatarios=data.destinatarios,
            asunto=data.asunto,
            contenido_html=data.contenido_html,
            contenido_texto=data.contenido_texto
        )

        return {
            "success": True,
            "tipo": "generico",
            "resultado": resultado
        }

    except Exception as e:
        logger.error(f"Error en enviar_email_generico: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al enviar email: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
