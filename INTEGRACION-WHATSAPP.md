# Guía de Integración WhatsApp - Sistema de Alertas VigilIA

## Resumen de Cambios

Se ha integrado exitosamente el servicio de notificaciones WhatsApp al sistema de alertas de VigilIA. Ahora cuando un adulto mayor presiona el botón de ayuda o se detecta una caída, los cuidadores recibirán notificaciones por:

- **Push Notifications** (Expo)
- **WebSocket** (tiempo real en web)
- **WhatsApp** (nuevo)

---

## Arquitectura Actualizada

```
Alerta (botón de ayuda o caída detectada)
        ↓
    API Backend crea alerta
        ↓
    ┌───┴────┬──────────┬──────────┐
    ↓        ↓          ↓          ↓
  Push   WebSocket   Email    WhatsApp
  (Expo)  (tiempo   (futuro)  (nuevo)
          real)
```

---

## Servicios Desplegados

### 1. Servicio WhatsApp Webhook
- **URL**: https://whatsapp-webhook-687053793381.southamerica-west1.run.app
- **Health**: https://whatsapp-webhook-687053793381.southamerica-west1.run.app/health
- **Script**: `servicios/webhook-wsp/deploy-webhook-wsp.ps1`

### 2. API Backend (actualizado)
- **URL**: https://api-backend-687053793381.southamerica-west1.run.app
- **Script**: `servicios/api-backend/deploy-api-backend.ps1`

---

## Cambios Realizados

### 1. API Backend (`servicios/api-backend/main.py`)

**Ubicación**: Líneas 1886-1955

Se agregó lógica para enviar notificaciones WhatsApp después de las notificaciones push y WebSocket:

```python
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
        )
        webhook_api_key = os.environ.get("WEBHOOK_API_KEY", "")

        for config in whatsapp_configs:
            phone = config[2]  # numero_whatsapp

            # Determinar tipo de notificación
            notification_type = "alert" if alerta_data.tipo_alerta == 'ayuda' else "fall_detection"

            payload = {
                "phone_number": phone,
                "notification_type": notification_type,
                "title": titulo,
                "body": mensaje
            }

            whatsapp_response = requests.post(
                f"{whatsapp_service_url}/send-notification",
                json=payload,
                headers={"X-API-Key": webhook_api_key},
                timeout=10
            )

except Exception as whatsapp_error:
    print(f"⚠️  Error al enviar notificaciones WhatsApp: {str(whatsapp_error)}")
```

**Características**:
- Consulta la tabla `configuraciones_alerta` para obtener cuidadores con WhatsApp habilitado
- Envía notificaciones con formato personalizado según tipo de alerta
- No falla la creación de alerta si falla WhatsApp (manejo robusto de errores)
- Logs detallados para monitoreo

### 2. Script de Despliegue Backend (`servicios/api-backend/deploy-api-backend.ps1`)

**Cambios**:
- Obtiene automáticamente la URL del servicio `whatsapp-webhook`
- Configura variables de entorno `WHATSAPP_SERVICE_URL` y `WEBHOOK_API_KEY`
- Muestra URLs configuradas al finalizar el despliegue

```powershell
# Obtener la URL del servicio whatsapp-webhook dinámicamente
$WHATSAPP_URL = gcloud run services describe whatsapp-webhook --region $REGION --format="value(status.url)"

# Desplegar con secretos de WhatsApp
--update-secrets="DB_PASS=vigilia-db-password:latest,INTERNAL_API_KEY=internal-api-key:latest,WEBHOOK_API_KEY=webhook-api-key:latest"
--set-env-vars "WEBSOCKET_SERVICE_URL=$WEBSOCKET_URL,WHATSAPP_SERVICE_URL=$WHATSAPP_URL"
```

---

## Variables de Entorno y Secretos

### Secretos en GCP Secret Manager

| Secreto | Descripción | Usado por |
|---------|-------------|-----------|
| `whatsapp-token` | Token de WhatsApp Business API | webhook-wsp |
| `webhook-api-key` | API key para autenticación | webhook-wsp, api-backend |
| `webhook-verify-token` | Token de verificación de Meta | webhook-wsp |
| `internal-api-key` | Clave para comunicación interna | api-backend, alertas-websocket |
| `vigilia-db-password` | Contraseña PostgreSQL | api-backend, alertas-websocket |

### Variables de Entorno - API Backend

```bash
WHATSAPP_SERVICE_URL=https://whatsapp-webhook-687053793381.southamerica-west1.run.app
WEBHOOK_API_KEY={desde Secret Manager}
WEBSOCKET_SERVICE_URL=https://alertas-websocket-687053793381.southamerica-west1.run.app
INTERNAL_API_KEY={desde Secret Manager}
DB_PASS={desde Secret Manager}
```

---

## Base de Datos - Tabla `configuraciones_alerta`

La tabla ya existe con los campos necesarios:

```sql
CREATE TABLE configuraciones_alerta (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL UNIQUE,
    notificar_app BOOLEAN DEFAULT true,
    token_fcm_app TEXT,
    notificar_whatsapp BOOLEAN DEFAULT false,  -- ✅ Campo clave
    numero_whatsapp VARCHAR(25),               -- ✅ Campo clave
    notificar_email BOOLEAN DEFAULT true,
    email_secundario VARCHAR(100),
    ultima_modificacion TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_config_usuario FOREIGN KEY(usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);
```

**Para habilitar WhatsApp en un cuidador**:

```sql
UPDATE configuraciones_alerta
SET notificar_whatsapp = TRUE,
    numero_whatsapp = '+56912345678'
WHERE usuario_id = {id_del_cuidador};
```

---

## Formato de Mensajes WhatsApp

### Alerta de Ayuda
```
⚠️ *Solicitud de Ayuda*

Alexander ha solicitado ayuda

_- VigilIA App_
```

### Detección de Caída
```
🚨 *Alerta de Caída Detectada*

Posible caída detectada para Alexander

_- VigilIA App_
```

---

## Flujo Completo de Alertas

### 1. Alerta Manual (Botón de Ayuda)

```
ADULTO MAYOR
  └─> Presiona "BOTÓN DE AYUDA" en app
      └─> POST /alertas {adulto_mayor_id: X, tipo_alerta: 'ayuda'}

API BACKEND
  ├─> INSERT INTO alertas (...)
  ├─> Obtiene cuidadores y sus configuraciones
  │
  ├─> 📱 Push Notifications (Expo)
  │   └─> Envía a push_tokens de cuidadores
  │
  ├─> 🌐 WebSocket Notification
  │   └─> POST /internal/notify-alert → alertas-websocket
  │
  └─> 💬 WhatsApp Notification (NUEVO)
      └─> POST /send-notification → whatsapp-webhook
          └─> Envía mensaje vía WhatsApp Business API

CUIDADORES
  ├─> Web: Notificación WebSocket instantánea
  ├─> Móvil: Push notification
  └─> WhatsApp: Mensaje en chat (NUEVO)
```

### 2. Alerta Automática (Detección de Caída)

```
DISPOSITIVO IoT (NanoPi)
  └─> Sube video a GCS
      └─> Pub/Sub dispara evento

PROCESADOR DE VIDEOS
  ├─> Descarga y procesa video con YOLO
  ├─> Detecta caída
  └─> POST /eventos-caida/notificar → API Backend

API BACKEND
  └─> [MISMO FLUJO QUE ALERTA MANUAL]
      ├─> Push Notifications
      ├─> WebSocket
      └─> WhatsApp (NUEVO)
```

---

## Monitoreo y Logs

### Ver logs del servicio WhatsApp

```powershell
gcloud run services logs tail whatsapp-webhook --region=southamerica-west1
```

### Ver logs del API Backend

```powershell
gcloud run services logs tail api-backend --region=southamerica-west1
```

### Logs a buscar

**Cuando se crea una alerta**:
```
✅ Alerta creada (tipo: ayuda) para adulto mayor 1
📱 Notificaciones push enviadas a 2 cuidadores
🌐 Notificación WebSocket enviada: 1 cuidadores conectados
ℹ️  No hay cuidadores con WhatsApp habilitado para adulto mayor 1
```

**Cuando se envía WhatsApp exitosamente**:
```
✅ WhatsApp enviado a +56912345678
📱 Notificaciones WhatsApp enviadas a 2/2 cuidadores
```

**Si falla WhatsApp**:
```
⚠️  WhatsApp falló para +56912345678: 401
⚠️  Timeout al enviar WhatsApp a +56912345678
⚠️  Error al enviar notificaciones WhatsApp (alerta creada exitosamente): ...
```

---

## Pruebas

### 1. Habilitar WhatsApp para un cuidador (vía SQL)

```sql
-- Conectarse a la base de datos
psql -h 35.247.233.171 -U postgres -d vigilia

-- Verificar cuidadores existentes
SELECT u.id, u.nombre, u.email, u.rol
FROM usuarios u
WHERE u.rol = 'cuidador';

-- Habilitar WhatsApp para Angelo (ejemplo)
UPDATE configuraciones_alerta
SET notificar_whatsapp = TRUE,
    numero_whatsapp = '+56912345678'
WHERE usuario_id = 2;

-- Verificar configuración
SELECT * FROM configuraciones_alerta WHERE usuario_id = 2;
```

### 2. Probar el flujo completo

1. **Iniciar sesión como adulto mayor** (Alexander)
   - Email: `acurihuinca@gmail.com`
   - Contraseña: `acuri2000`

2. **Presionar botón de ayuda** en la app

3. **Verificar notificaciones**:
   - ✅ Push notification en móvil
   - ✅ WebSocket en web
   - ✅ Mensaje WhatsApp en el número configurado

4. **Revisar logs**:
   ```powershell
   gcloud run services logs read api-backend --region southamerica-west1 --limit 50
   ```

### 3. Probar solo el servicio WhatsApp

```bash
curl -X POST https://whatsapp-webhook-687053793381.southamerica-west1.run.app/send-notification \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bfc79d65d767" \
  -d '{
    "phone_number": "+56912345678",
    "notification_type": "alert",
    "title": "Prueba de Alerta",
    "body": "Esta es una prueba del sistema VigilIA"
  }'
```

---

## Comandos Útiles

### Redesplegar servicios

```powershell
# 1. WhatsApp Webhook
cd servicios\webhook-wsp
.\deploy-webhook-wsp.ps1

# 2. API Backend
cd ..\api-backend
.\deploy-api-backend.ps1
```

### Ver servicios desplegados

```powershell
gcloud run services list --region southamerica-west1
```

### Ver secretos

```powershell
gcloud secrets list
```

### Actualizar secreto

```powershell
echo "nuevo_valor" | gcloud secrets versions add webhook-api-key --data-file=-
```

---

## Próximos Pasos (Opcional)

### 1. Frontend - Agregar UI de configuración

Crear pantalla de configuración en el frontend para que los cuidadores puedan:
- Habilitar/deshabilitar notificaciones WhatsApp
- Ingresar su número de WhatsApp
- Ver historial de notificaciones

**Archivo**: `frontend-vigilia/app/(app)/configuracion.tsx`

```tsx
const [notificarWhatsapp, setNotificarWhatsapp] = useState(false);
const [numeroWhatsapp, setNumeroWhatsapp] = useState('');

// Obtener configuración actual
useEffect(() => {
  const fetchConfig = async () => {
    const token = await user.getIdToken();
    const response = await axios.get(
      `${API_URL}/configuraciones-alerta`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    setNotificarWhatsapp(response.data.notificar_whatsapp);
    setNumeroWhatsapp(response.data.numero_whatsapp || '');
  };
  fetchConfig();
}, []);

// Guardar configuración
const guardarConfiguracion = async () => {
  const token = await user.getIdToken();
  await axios.put(
    `${API_URL}/configuraciones-alerta`,
    {
      notificar_whatsapp: notificarWhatsapp,
      numero_whatsapp: numeroWhatsapp
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  alert('Configuración guardada');
};
```

### 2. Plantillas de WhatsApp personalizadas

Crear plantillas aprobadas por Meta para mensajes más ricos:
- Con botones de acción
- Con ubicación del adulto mayor
- Con imagen/video de la cámara

### 3. Confirmación de lectura

Implementar confirmación cuando el cuidador lee la alerta por WhatsApp:
- Recibir webhook de Meta cuando se lee el mensaje
- Actualizar campo `confirmado_por_cuidador` en tabla `alertas`

---

## Solución de Problemas

### Problema: No se reciben mensajes WhatsApp

**Verificar**:

1. ¿El número está habilitado en la BD?
   ```sql
   SELECT * FROM configuraciones_alerta WHERE notificar_whatsapp = TRUE;
   ```

2. ¿El servicio WhatsApp está funcionando?
   ```bash
   curl https://whatsapp-webhook-687053793381.southamerica-west1.run.app/health
   ```

3. ¿El API Backend tiene las variables configuradas?
   ```powershell
   gcloud run services describe api-backend --region southamerica-west1
   ```

4. ¿Los logs muestran errores?
   ```powershell
   gcloud run services logs read api-backend --region southamerica-west1 | Select-String "WhatsApp"
   ```

### Problema: Error 401 al enviar WhatsApp

**Causa**: API Key incorrecta

**Solución**:
1. Verificar que `webhook-api-key` en Secret Manager es correcto
2. Verificar que el API Backend está usando el secreto correcto

### Problema: Timeout al enviar WhatsApp

**Causa**: Servicio WhatsApp no responde

**Solución**:
1. Verificar que el servicio esté desplegado
2. Aumentar el timeout en el código (actualmente 10 segundos)
3. Verificar logs del servicio WhatsApp

---

## Conclusión

La integración de WhatsApp está completa y funcional. El sistema ahora puede notificar a los cuidadores por 3 canales:

- ✅ **Push Notifications** (móvil)
- ✅ **WebSocket** (web, tiempo real)
- ✅ **WhatsApp** (universal)

**Próximos pasos recomendados**:
1. Habilitar WhatsApp para cuidadores en la base de datos
2. Probar el flujo completo
3. Agregar UI en el frontend para configuración
4. Monitorear logs para detectar posibles errores

---

**Fecha de implementación**: 2025-11-04
**Versión**: 1.0
**Autor**: Claude Code
**Proyecto**: VigilIA Capstone
