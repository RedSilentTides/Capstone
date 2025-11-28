# Servicio WhatsApp Webhook - VigilIA

Servicio de integración con WhatsApp Business Cloud API para el envío de notificaciones de alertas y recordatorios del sistema VigilIA.

## Descripción

Este servicio actúa como intermediario entre la plataforma VigilIA y la API de WhatsApp Business Cloud, permitiendo:
- Envío de alertas de caídas detectadas
- Notificaciones de ayuda
- Recordatorios programados
- Mensajes de bienvenida

## Arquitectura

```
NanoPi/App → api-backend → whatsapp-webhook → Meta WhatsApp API → Usuario Final
```

## Estado de Templates

### Templates Aprobados
- ✅ **alertacaidatest** - Alerta de caída detectada (idioma: es_CL)
  - Parámetro: `nombre` - Nombre del adulto mayor

### Templates Pendientes
- ⏳ **welcome** - Mensaje de bienvenida
- ⏳ **help_alert** - Alerta de ayuda
- ⏳ **reminder** - Recordatorios programados

## Configuración

### Variables de Entorno (GCP Secret Manager)

| Secret | Descripción | Versión Actual |
|--------|-------------|----------------|
| `whatsapp-token` | Token de acceso de WhatsApp Business API | 11 |
| `whatsapp-phone-id` | ID del número de teléfono de WhatsApp | - |
| `webhook-api-key` | API Key para autenticación del webhook | - |
| `webhook-verify-token` | Token de verificación del webhook | - |

### Configuración Actual (Meta WhatsApp)

- **Phone Number ID**: `885336931326209`
- **API Version**: `v22.0`
- **Región Cloud Run**: `southamerica-west1`

## Endpoints

### POST `/send-notification`

Envía una notificación utilizando templates de WhatsApp.

**Headers:**
```
X-API-Key: {webhook-api-key}
Content-Type: application/json; charset=utf-8
```

**Body:**
```json
{
  "phone_number": "56912345678",
  "notification_type": "fall_alert",
  "title": "Alerta de Caída",
  "body": "Descripción de la alerta",
  "parameters": {
    "nombre_adulto_mayor": "María González"
  }
}
```

**Tipos de notificación:**
- `fall_alert` - Alerta de caída (template: alertacaidatest)
- `help_alert` - Alerta de ayuda (pendiente)
- `welcome` - Mensaje de bienvenida (pendiente)
- `reminder` - Recordatorio (pendiente)

**Respuesta exitosa (200):**
```json
{
  "status": "sent",
  "notification_type": "fall_alert",
  "template_used": "alertacaidatest",
  "message_id": "wamid.HBgLNTY5Mzc4MDU3ODcVAgARGBI...",
  "response": {
    "messaging_product": "whatsapp",
    "contacts": [...],
    "messages": [...]
  }
}
```

### POST `/send-template`

Envía un mensaje usando una plantilla específica.

**Body:**
```json
{
  "to": "56912345678",
  "template_name": "alertacaidatest",
  "language_code": "es_CL"
}
```

### POST `/send-text`

Envía un mensaje de texto simple (solo disponible después de que el usuario inicie conversación).

**Body:**
```json
{
  "to": "56912345678",
  "message": "Tu mensaje aquí"
}
```

### POST `/webhook`

Endpoint para recibir webhooks de Meta WhatsApp API.

### GET `/webhook`

Endpoint para verificación de webhook por Meta.

## Estructura de Templates

### Configuración Correcta (IMPORTANTE)

Los templates **DEBEN** incluir el campo `parameter_name` en cada parámetro:

```json
{
  "messaging_product": "whatsapp",
  "to": "56912345678",
  "type": "template",
  "template": {
    "name": "alertacaidatest",
    "language": {
      "code": "es_CL"
    },
    "components": [
      {
        "type": "body",
        "parameters": [
          {
            "type": "text",
            "parameter_name": "nombre",
            "text": "Nombre del Adulto Mayor"
          }
        ]
      }
    ]
  }
}
```

**Nota:** El campo `parameter_name` es **obligatorio** aunque no esté explícitamente documentado en la API de Meta.

## Codificación UTF-8

El servicio está configurado para manejar correctamente caracteres especiales del español (ñ, á, é, etc.):

- Declaración UTF-8 en el código fuente: `# -*- coding: utf-8 -*-`
- Headers con charset: `Content-Type: application/json; charset=utf-8`
- Encoding explícito: `json.dumps(payload, ensure_ascii=False).encode('utf-8')`

## Deployment

### Desplegar nueva versión

```bash
cd servicios/webhook-wsp
gcloud run deploy whatsapp-webhook \
  --source . \
  --region southamerica-west1 \
  --allow-unauthenticated
```

### Actualizar secrets

```bash
# Actualizar token de WhatsApp
echo -n "NUEVO_TOKEN" | gcloud secrets versions add whatsapp-token --data-file=-

# Forzar uso de una versión específica
gcloud run services update whatsapp-webhook \
  --region southamerica-west1 \
  --update-secrets=WHATSAPP_TOKEN=whatsapp-token:11
```

## Testing

### Ejemplo con curl

```bash
# Obtener API Key
API_KEY=$(gcloud secrets versions access latest --secret="webhook-api-key")

# Enviar notificación de caída
curl -X POST "https://whatsapp-webhook-687053793381.southamerica-west1.run.app/send-notification" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{
    "phone_number": "56912345678",
    "notification_type": "fall_alert",
    "title": "Alerta de Caída",
    "body": "Posible caída detectada",
    "parameters": {
      "nombre_adulto_mayor": "María González"
    }
  }'
```

### Verificar logs

```bash
gcloud run services logs read whatsapp-webhook \
  --region southamerica-west1 \
  --limit 50
```

## Troubleshooting

### Error: "Parameter name is missing or empty"

**Causa:** Falta el campo `parameter_name` en los parámetros del template.

**Solución:** Asegurar que cada parámetro incluya `parameter_name`:
```json
{
  "type": "text",
  "parameter_name": "nombre",
  "text": "Valor del parámetro"
}
```

### Error: "Object with ID does not exist"

**Causa:** Phone Number ID incorrecto o token sin permisos.

**Solución:**
1. Verificar que `whatsapp-phone-id` sea correcto
2. Verificar que el token tenga permisos para ese Phone Number ID
3. Regenerar token desde Meta Business Suite si es necesario

### Caracteres especiales corruptos

**Causa:** Problema de codificación UTF-8.

**Solución:**
- Asegurar que el código fuente tenga `# -*- coding: utf-8 -*-`
- Usar `Content-Type: application/json; charset=utf-8`
- Codificar payload: `.encode('utf-8')`

### Token con longitud incorrecta (196 bytes en vez de 195)

**Causa:** Salto de línea al final del secret.

**Solución:**
```bash
# Usar echo -n para evitar newline
echo -n "TOKEN_SIN_NEWLINE" | gcloud secrets versions add whatsapp-token --data-file=-
```

## Crear Nuevos Templates

1. **Acceder a Meta Business Suite**
   - https://business.facebook.com/
   - Ir a "WhatsApp Manager" → "Message Templates"

2. **Crear Template**
   - Nombre: usar snake_case (ej: `alerta_ayuda`)
   - Categoría: Utility (para alertas/notificaciones)
   - Idioma: Spanish (Chile) - `es_CL`
   - Contenido: Agregar texto y variables usando `{{1}}`, `{{2}}`, etc.

3. **Esperar Aprobación**
   - Meta revisa templates en ~15 minutos
   - Estado: Pending → Approved/Rejected

4. **Actualizar Código**
   - Agregar configuración en `get_template_config()` en [main.py](main.py#L298)
   ```python
   "nuevo_tipo": {
       "name": "nombre_template_meta",
       "language": "es_CL",
       "components": [
           {
               "type": "body",
               "parameters": [
                   {
                       "type": "text",
                       "parameter_name": "variable1",
                       "text": parameters.get("variable1", "Default")
                   }
               ]
           }
       ]
   }
   ```

5. **Desplegar y Probar**

## Archivos de Referencia

- [Body Send Mensasage APIWSP.json](Body%20Send%20Mensasage%20APIWSP.json) - Ejemplo de payload que funciona en Postman
- [Cloud API.postman_environment.json](Cloud%20API.postman_environment.json) - Configuración de entorno Postman
- [Template Curl.txt](Template%20Curl.txt) - Ejemplos de comandos curl

## URLs Importantes

- **Servicio**: https://whatsapp-webhook-687053793381.southamerica-west1.run.app
- **Logs**: [Cloud Run Console](https://console.cloud.google.com/run/detail/southamerica-west1/whatsapp-webhook/logs)
- **Secrets**: [Secret Manager](https://console.cloud.google.com/security/secret-manager)
- **Meta Business**: https://business.facebook.com/
- **WhatsApp API Docs**: https://developers.facebook.com/docs/whatsapp/cloud-api

## Contacto

Para issues o preguntas sobre este servicio, contactar al equipo de desarrollo de VigilIA.

---

**Última actualización**: 2025-11-16
**Versión actual**: whatsapp-webhook-00046
**Estado**: ✅ Funcionando
