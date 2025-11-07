# Guía de Integración - Sistema de Notificaciones por Email

Esta guía te ayudará a configurar y desplegar el sistema completo de notificaciones por email para VigilIA.

## 📋 Resumen

El sistema de notificaciones por email incluye:
- ✅ **Servicio api-email**: Microservicio FastAPI con SendGrid para envío de emails
- ✅ **Templates HTML**: Emails profesionales para caídas, ayuda y recordatorios
- ✅ **Integración con api-backend**: Llamadas automáticas al servicio de email
- ✅ **Configuración de usuarios**: Soporte para email secundario y preferencias

## 🚀 Pasos de Configuración

### 1. Configurar SendGrid

Ejecuta el script de configuración:

```powershell
cd servicios\api-email
.\setup-sendgrid.ps1
```

Este script te guiará para:
1. Crear cuenta en SendGrid (gratuita)
2. Generar API Key
3. Verificar remitente
4. Guardar API Key en GCP Secret Manager

**Nota:** Si ya tienes una cuenta de SendGrid, solo ejecuta este comando manualmente:

```powershell
# Crear el secret con tu API Key de SendGrid
echo "TU_SENDGRID_API_KEY_AQUI" | powershell -Command "gcloud secrets create SENDGRID_API_KEY --data-file=- --project=composed-apogee-475623-p6"

# O si ya existe, agregar nueva versión:
echo "TU_SENDGRID_API_KEY_AQUI" | powershell -Command "gcloud secrets versions add SENDGRID_API_KEY --data-file=- --project=composed-apogee-475623-p6"
```

### 2. Desplegar Servicio de Email

```powershell
cd servicios\api-email
.\deploy.ps1
```

Este script:
- Construye la imagen Docker
- Despliega en Cloud Run
- Configura los secrets
- Te muestra la URL del servicio

**Guarda la URL del servicio**, la necesitarás en el siguiente paso.

Ejemplo de URL: `https://api-email-687053793381.southamerica-west1.run.app`

### 3. Configurar api-backend

Necesitas agregar la variable de entorno `EMAIL_SERVICE_URL` en el servicio `api-backend` de Cloud Run.

#### Opción A: Desde la Consola de GCP

1. Ve a [Cloud Run](https://console.cloud.google.com/run)
2. Selecciona el servicio `api-backend`
3. Click en "EDIT & DEPLOY NEW REVISION"
4. En "Variables & Secrets" > "Variables"
5. Agregar variable:
   - **Name:** `EMAIL_SERVICE_URL`
   - **Value:** `https://api-email-687053793381.southamerica-west1.run.app` (tu URL del paso 2)
6. Click "DEPLOY"

#### Opción B: Desde PowerShell

```powershell
# Actualizar api-backend con la URL del servicio de email
$EMAIL_SERVICE_URL = "https://api-email-687053793381.southamerica-west1.run.app"

gcloud run services update api-backend `
    --update-env-vars "EMAIL_SERVICE_URL=$EMAIL_SERVICE_URL" `
    --region southamerica-west1 `
    --project composed-apogee-475623-p6
```

### 4. Verificar Despliegue

Verifica que el servicio de email esté funcionando:

```powershell
# Health check
curl https://api-email-687053793381.southamerica-west1.run.app/health
```

Deberías ver:
```json
{
  "status": "healthy",
  "sendgrid_configured": true,
  "internal_api_configured": true,
  "sender_email": "noreply@vigilia.app",
  "timestamp": "2025-11-06T..."
}
```

### 5. Probar Envío de Emails

#### Prueba Manual

Crea un archivo `test-email.json`:

```json
{
  "destinatarios": [
    {"email": "tu_email@ejemplo.com", "name": "Tu Nombre"}
  ],
  "adulto_mayor_nombre": "Juan Pérez Test",
  "timestamp": "2025-11-06T10:30:00Z"
}
```

Ejecuta:

```powershell
# Obtener el INTERNAL_API_KEY
$INTERNAL_KEY = gcloud secrets versions access latest --secret="internal-api-key" --project=composed-apogee-475623-p6

# Probar alerta de caída
curl -X POST https://api-email-687053793381.southamerica-west1.run.app/send/alerta-caida `
  -H "Content-Type: application/json" `
  -H "X-Internal-Key: $INTERNAL_KEY" `
  -d '@test-email.json'

# Probar solicitud de ayuda
curl -X POST https://api-email-687053793381.southamerica-west1.run.app/send/alerta-ayuda `
  -H "Content-Type: application/json" `
  -H "X-Internal-Key: $INTERNAL_KEY" `
  -d '@test-email.json'
```

#### Prueba con el Sistema Completo

Para probar el flujo completo desde la app:

1. **Alerta de Caída**:
   - Sube un video al bucket de Cloud Storage
   - El procesador YOLO detectará la caída
   - Se creará la alerta automáticamente
   - Se enviarán notificaciones push, WebSocket, WhatsApp y **Email**

2. **Solicitud de Ayuda**:
   - Desde la app móvil del adulto mayor
   - Presiona el botón "Solicitar Ayuda"
   - Se crearán todas las notificaciones incluyendo email

## 🎨 Personalización de Emails

### Cambiar Remitente

Edita las variables de entorno en el despliegue:

```powershell
gcloud run services update api-email `
    --update-env-vars "SENDER_EMAIL=alertas@tudominio.com,SENDER_NAME=Tu Nombre de Empresa" `
    --region southamerica-west1 `
    --project composed-apogee-475623-p6
```

**Importante:** Si cambias el email remitente, debes verificarlo en SendGrid:
1. Settings > Sender Authentication > Verify a Single Sender
2. Agrega el nuevo email
3. Verifica desde tu bandeja de entrada

### Modificar Templates HTML

Los templates se generan en [servicios/api-email/main.py](servicios/api-email/main.py):

- `generar_html_caida()` - Línea 124
- `generar_html_ayuda()` - Línea 193
- `generar_html_recordatorio()` - Línea 253

Puedes editar colores, estilos y contenido directamente en estas funciones.

Después de modificar, redespliega:

```powershell
cd servicios\api-email
.\deploy.ps1
```

## 📊 Configuración de Usuarios

Los usuarios pueden configurar sus preferencias de email desde la app:

### Campos en la Base de Datos

**Tabla `usuarios`:**
- `email`: Email principal (obligatorio al registrarse)

**Tabla `configuraciones_alerta`:**
- `notificar_email`: Boolean (default: true)
- `email_secundario`: Email alternativo para recibir alertas

### Lógica de Envío

1. Si `notificar_email = FALSE` → No se envían emails
2. Si `email_secundario` está configurado → Se envía ahí
3. Si no hay `email_secundario` → Se usa el email principal

### Endpoint para Configurar Preferencias

Ya existe en api-backend:

```http
PUT /configuracion
Authorization: Bearer <firebase_token>
Content-Type: application/json

{
  "notificar_email": true,
  "email_secundario": "otro_email@ejemplo.com"
}
```

## 📈 Monitoreo y Logs

### Ver Logs del Servicio de Email

```powershell
# Logs en tiempo real
gcloud run services logs read api-email `
    --region=southamerica-west1 `
    --project=composed-apogee-475623-p6 `
    --limit=50

# Filtrar solo errores
gcloud run services logs read api-email `
    --region=southamerica-west1 `
    --project=composed-apogee-475623-p6 `
    --log-filter="severity>=ERROR"
```

### Dashboard de SendGrid

1. Inicia sesión en https://app.sendgrid.com/
2. Ve a "Activity" para ver emails enviados
3. Monitorea:
   - Emails entregados
   - Bounces (rebotes)
   - Spam reports
   - Opens y Clicks (si está habilitado)

### Métricas en Cloud Run

```powershell
# Ver métricas del servicio
gcloud run services describe api-email `
    --region=southamerica-west1 `
    --project=composed-apogee-475623-p6
```

O visita: https://console.cloud.google.com/run/detail/southamerica-west1/api-email/metrics

## 🔒 Seguridad

### Protección de Endpoints

Todos los endpoints de email requieren el header `X-Internal-Key` que coincide con el secret `internal-api-key` en GCP.

Solo los servicios internos (api-backend) pueden llamar al servicio de email.

### Rotación de API Keys

Para rotar el SendGrid API Key:

1. Crea una nueva API Key en SendGrid
2. Actualiza el secret:
   ```powershell
   echo "NUEVA_API_KEY" | powershell -Command "gcloud secrets versions add SENDGRID_API_KEY --data-file=- --project=composed-apogee-475623-p6"
   ```
3. Redespliega el servicio o espera a que Cloud Run use la nueva versión

## 💰 Costos y Límites

### SendGrid (Plan Gratuito)
- **Límite:** 100 emails/día
- **Costo:** $0

### SendGrid (Planes Pagados)
- **Essentials:** $15/mes - 50,000 emails/mes
- **Pro:** $90/mes - 100,000 emails/mes

### Cloud Run (api-email)
- **Configuración actual:**
  - Memory: 512Mi
  - CPU: 1
  - Min instances: 0
  - Max instances: 10

- **Costo estimado:** ~$1-5/mes (con tráfico bajo)
- **Free tier:** 2 millones de requests/mes

## 🐛 Solución de Problemas

### Emails no llegan

1. **Verifica el remitente en SendGrid:**
   ```
   Settings > Sender Authentication > Verify a Single Sender
   ```

2. **Revisa la carpeta de spam** del destinatario

3. **Verifica logs del servicio:**
   ```powershell
   gcloud run services logs read api-email --region=southamerica-west1 --project=composed-apogee-475623-p6
   ```

4. **Verifica Activity en SendGrid** para ver si el email fue enviado

### Error 503: Service Unavailable

- El servicio no está configurado o no responde
- Verifica que esté desplegado: `gcloud run services list --project=composed-apogee-475623-p6`
- Revisa que los secrets estén configurados

### Error 401: Unauthorized

- El `X-Internal-Key` header no coincide
- Verifica que api-backend tenga el `INTERNAL_API_KEY` correcto

### SendGrid API Error

```
Error al enviar emails: Status 401
```

- La API Key de SendGrid no es válida o expiró
- Crea una nueva API Key y actualiza el secret

## 🔄 Implementar Recordatorios Programados

Los recordatorios aún no se envían automáticamente. Para implementarlo:

### Opción 1: Cloud Scheduler + Cloud Function

Crea una Cloud Function que:
1. Consulte recordatorios pendientes en la BD
2. Llame al servicio de email para los que correspondan

Programa la función con Cloud Scheduler cada hora.

### Opción 2: Agregar lógica en api-backend

En [servicios/api-backend/main.py](servicios/api-backend/main.py), agrega un endpoint interno:

```python
@app.post("/internal/process-reminders")
async def process_pending_reminders(is_authorized: bool = Depends(verify_internal_token)):
    # Consultar recordatorios pendientes
    # Enviar notificaciones (push, email, etc.)
    # Actualizar estado a 'enviado'
    pass
```

Llama a este endpoint desde un Cloud Scheduler cada hora.

## 📞 Soporte

Si encuentras problemas:

1. Revisa los logs en Cloud Run
2. Verifica el dashboard de SendGrid
3. Consulta la [documentación de SendGrid](https://docs.sendgrid.com/)
4. Revisa [servicios/api-email/README.md](servicios/api-email/README.md)

## ✅ Checklist de Verificación

- [ ] SendGrid configurado y remitente verificado
- [ ] Secret `SENDGRID_API_KEY` creado en GCP
- [ ] Servicio `api-email` desplegado en Cloud Run
- [ ] Variable `EMAIL_SERVICE_URL` configurada en `api-backend`
- [ ] Prueba de email de caída exitosa
- [ ] Prueba de email de ayuda exitosa
- [ ] Logs sin errores en ambos servicios

---

**¡Felicidades!** 🎉 Tu sistema de notificaciones por email está configurado y funcionando.
