# Configuración de Infraestructura GCP - Sistema de Detección de Caídas

Este documento describe cómo configurar toda la infraestructura en Google Cloud Platform para el sistema de detección de caídas de VigilIA.

## Arquitectura del Sistema

```
┌─────────────┐
│   NanoPi    │ Captura video cada 20s
│  (Cámara)   │
└──────┬──────┘
       │ gsutil cp
       ▼
┌────────────────────────────────────┐
│  Cloud Storage Bucket              │
│  gs://nanopi-videos-input/{HW_ID}/ │
└──────┬─────────────────────────────┘
       │ Notificación automática
       ▼
┌─────────────────┐
│   Pub/Sub Topic │
│ video-upload... │
└──────┬──────────┘
       │ Push Subscription
       ▼
┌──────────────────────────────┐
│  Cloud Run Service           │
│  procesador-videos           │
│  • Descarga video            │
│  • Procesa con YOLOv8        │
│  • Detecta caídas            │
└──────┬───────────────────────┘
       │ Si detecta caída
       ▼
┌─────────────────────┐
│  API Backend        │
│  /eventos-caida     │
│  /notificar         │
└─────────────────────┘
```

## Recursos de GCP Necesarios

1. **Cloud Storage Bucket**: `nanopi-videos-input`
   - Almacena videos subidos por las NanoPi
   - Organizado por Hardware ID: `{HW_ID}/video_YYYYMMDD_HHMMSS.mp4`

2. **Pub/Sub Topic**: `video-upload-topic`
   - Recibe notificaciones cuando se sube un nuevo video al bucket

3. **Pub/Sub Subscription**: `video-processor-subscription`
   - Subscription tipo PUSH que envía mensajes al Cloud Run service

4. **Cloud Run Service**: `procesador-videos`
   - Servicio contenedor que ejecuta el procesamiento YOLO
   - Auto-escalable (0-10 instancias)
   - 2 CPU, 2GB RAM, timeout 10 minutos

5. **Service Account**: `procesador-videos-sa`
   - Identidad para el servicio con permisos específicos
   - Roles: `storage.objectViewer`, `pubsub.subscriber`, `run.invoker`

## Prerequisitos

1. **Google Cloud SDK instalado**:
   ```bash
   # Verificar instalación
   gcloud version
   ```

2. **Autenticación configurada**:
   ```bash
   gcloud auth login
   gcloud config set project composed-apogee-475623-p6
   ```

3. **Variables de entorno necesarias**:
   - `internal-api-key`: Clave secreta compartida entre procesador-videos y api-backend

4. **Archivos necesarios en el directorio**:
   - `main.py`: Código principal del procesador
   - `requirements.txt`: Dependencias Python
   - `classes.txt`: Clases de YOLO
   - `yolov8s.pt`: Modelo YOLOv8 pre-entrenado
   - `Dockerfile`: Configuración del contenedor

## Instalación Automática

### Opción 1: Script Automatizado (Recomendado)

```bash
cd servicios/procesador-videos
chmod +x setup-gcp-infrastructure.sh
./setup-gcp-infrastructure.sh
```

El script realizará:
1. Habilitación de APIs necesarias
2. Creación del bucket (si no existe)
3. Configuración de Pub/Sub (topic y notificaciones)
4. Creación del Service Account con permisos
5. Build y deploy del servicio en Cloud Run
6. Configuración de la suscripción push
7. Configuración de permisos de invocación

**Duración estimada**: 5-10 minutos

Durante la ejecución, se te solicitará el `internal-api-key`. Este valor debe coincidir con el configurado en tu `api-backend`.

### Opción 2: Instalación Manual

Si prefieres realizar la configuración paso a paso:

#### Paso 1: Habilitar APIs

```bash
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    pubsub.googleapis.com \
    storage-api.googleapis.com \
    artifactregistry.googleapis.com
```

#### Paso 2: Crear Bucket

```bash
gsutil mb -p composed-apogee-475623-p6 \
    -c STANDARD \
    -l southamerica-west1 \
    gs://nanopi-videos-input/
```

#### Paso 3: Crear Tópico Pub/Sub

```bash
gcloud pubsub topics create video-upload-topic
```

#### Paso 4: Configurar Notificación de Storage

```bash
gsutil notification create \
    -t video-upload-topic \
    -f json \
    gs://nanopi-videos-input
```

#### Paso 5: Crear Service Account

```bash
gcloud iam service-accounts create procesador-videos-sa \
    --display-name="Procesador de Videos Service Account"

# Asignar permisos
PROJECT_ID="composed-apogee-475623-p6"
SA_EMAIL="procesador-videos-sa@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/storage.objectViewer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/pubsub.subscriber"
```

#### Paso 6: Desplegar en Cloud Run

```bash
cd servicios/procesador-videos

gcloud run deploy procesador-videos \
    --source . \
    --region southamerica-west1 \
    --platform managed \
    --service-account procesador-videos-sa@composed-apogee-475623-p6.iam.gserviceaccount.com \
    --set-env-vars "GCP_PROJECT=composed-apogee-475623-p6,BACKEND_API_URL=https://api-backend-687053793381.southamerica-west1.run.app,internal-api-key=TU_API_KEY_AQUI" \
    --memory 2Gi \
    --cpu 2 \
    --timeout 600 \
    --max-instances 10 \
    --min-instances 0 \
    --no-allow-unauthenticated
```

#### Paso 7: Crear Suscripción Push

```bash
# Obtener URL del servicio
SERVICE_URL=$(gcloud run services describe procesador-videos \
    --region southamerica-west1 \
    --format='value(status.url)')

# Crear suscripción
gcloud pubsub subscriptions create video-processor-subscription \
    --topic=video-upload-topic \
    --push-endpoint=$SERVICE_URL \
    --push-auth-service-account=procesador-videos-sa@composed-apogee-475623-p6.iam.gserviceaccount.com \
    --ack-deadline=600 \
    --message-retention-duration=7d
```

#### Paso 8: Configurar Permisos de Invocación

```bash
gcloud run services add-iam-policy-binding procesador-videos \
    --region=southamerica-west1 \
    --member="serviceAccount:procesador-videos-sa@composed-apogee-475623-p6.iam.gserviceaccount.com" \
    --role="roles/run.invoker"
```

## Verificación del Sistema

### 1. Verificar que el servicio está ejecutándose

```bash
gcloud run services describe procesador-videos \
    --region southamerica-west1 \
    --format='value(status.conditions.status)'
```

Debe mostrar: `True`

### 2. Ver los logs en tiempo real

```bash
gcloud run services logs tail procesador-videos \
    --region=southamerica-west1
```

### 3. Probar la subida de un video

```bash
# Subir un video de prueba
gsutil cp test-video.mp4 gs://nanopi-videos-input/test-hw-id/test.mp4

# Monitorear logs inmediatamente
gcloud run services logs tail procesador-videos --region=southamerica-west1
```

Deberías ver en los logs:
```
📬 Evento recibido para el archivo: gs://nanopi-videos-input/test-hw-id/test.mp4
Consultando al backend por el ID de hardware: test-hw-id
✅ Backend devolvió el ID de dispositivo numérico: X
Descargando video gs://nanopi-videos-input/test-hw-id/test.mp4 a /tmp/...
✅ Video descargado.
Iniciando procesamiento de video: /tmp/...
```

### 4. Verificar métricas en Cloud Console

Ve a: https://console.cloud.google.com/run/detail/southamerica-west1/procesador-videos/metrics

Métricas importantes:
- **Request count**: Número de videos procesados
- **Request latency**: Tiempo de procesamiento
- **Container CPU utilization**: Uso de CPU durante procesamiento
- **Container memory utilization**: Uso de memoria

## Configuración de la NanoPi

El script `capture_segments.txt` en tu NanoPi ya está configurado correctamente para usar:
- Bucket: `gs://nanopi-videos-input`
- Path: `gs://nanopi-videos-input/{HW_ID}/video_YYYYMMDD_HHMMSS.mp4`

El Hardware ID se obtiene automáticamente de la MAC address de `eth0`.

No necesitas cambiar nada en la NanoPi si el bucket se llama `nanopi-videos-input`.

## Costos Estimados

Para 1 dispositivo que sube videos cada 20 segundos (3 videos/minuto):

| Servicio | Uso Mensual | Costo Estimado (USD) |
|----------|-------------|---------------------|
| Cloud Storage | ~130 GB almacenados | $2.60 |
| Cloud Storage | ~130k operaciones | $0.05 |
| Pub/Sub | ~130k mensajes | $0.40 |
| Cloud Run | ~130k invocaciones | $0.40 |
| Cloud Run | ~260 vCPU-hours | $6.24 |
| Cloud Run | ~260 GB-hours memoria | $0.68 |
| **TOTAL** | | **~$10.37/mes** |

**Notas**:
- Asume que el 100% de los videos se procesan (caída detectada o no)
- No incluye costos de egreso de red
- Precio para región `southamerica-west1`
- Free tier de GCP puede cubrir parte de estos costos

## Troubleshooting

### Problema: El servicio no recibe eventos

**Verificar la notificación del bucket**:
```bash
gsutil notification list gs://nanopi-videos-input
```

Debe mostrar una notificación hacia `video-upload-topic`.

**Verificar la suscripción**:
```bash
gcloud pubsub subscriptions describe video-processor-subscription
```

### Problema: "Permission denied" en logs

El Service Account necesita permisos. Verificar:
```bash
gcloud projects get-iam-policy composed-apogee-475623-p6 \
    --flatten="bindings[].members" \
    --filter="bindings.members:procesador-videos-sa@*"
```

### Problema: "Failed to notify backend"

1. Verificar que `BACKEND_API_URL` esté correctamente configurada
2. Verificar que `internal-api-key` coincida en ambos servicios
3. Revisar logs del api-backend

### Problema: Video no se descarga

Verificar permisos de lectura del bucket:
```bash
gsutil iam get gs://nanopi-videos-input
```

### Problema: El modelo YOLO no carga

El modelo `yolov8s.pt` debe estar en el directorio al hacer build. Verificar que el Dockerfile lo copie:
```dockerfile
COPY yolov8s.pt .
```

## Actualización del Servicio

Para actualizar el código del procesador:

```bash
cd servicios/procesador-videos

# Opción 1: Redespliegue completo (recomendado)
gcloud run deploy procesador-videos \
    --source . \
    --region southamerica-west1

# Opción 2: Solo actualizar variables de entorno
gcloud run services update procesador-videos \
    --region southamerica-west1 \
    --set-env-vars "internal-api-key=NUEVA_CLAVE"
```

## Limpieza de Recursos

Para eliminar todos los recursos creados:

```bash
# Eliminar servicio Cloud Run
gcloud run services delete procesador-videos --region=southamerica-west1 --quiet

# Eliminar suscripción
gcloud pubsub subscriptions delete video-processor-subscription --quiet

# Eliminar notificación del bucket
NOTIFICATION_ID=$(gsutil notification list gs://nanopi-videos-input | grep -oP 'projects/_/buckets/nanopi-videos-input/notificationConfigs/\K\d+' | head -1)
gsutil notification delete $NOTIFICATION_ID gs://nanopi-videos-input

# Eliminar tópico
gcloud pubsub topics delete video-upload-topic --quiet

# Eliminar Service Account
gcloud iam service-accounts delete procesador-videos-sa@composed-apogee-475623-p6.iam.gserviceaccount.com --quiet

# OPCIONAL: Eliminar bucket (¡CUIDADO! Elimina todos los videos)
# gsutil -m rm -r gs://nanopi-videos-input
```

## Seguridad

### Recomendaciones

1. **internal-api-key**: Usar una clave fuerte y aleatoria (mínimo 32 caracteres)
   ```bash
   # Generar una clave segura
   openssl rand -base64 32
   ```

2. **Service Account**: Principio de mínimo privilegio - solo permisos necesarios

3. **Cloud Run**: Servicio NO público (`--no-allow-unauthenticated`)
   - Solo accesible desde Pub/Sub con autenticación

4. **Bucket**: Considerar Object Versioning para recuperación
   ```bash
   gsutil versioning set on gs://nanopi-videos-input
   ```

5. **Retention Policy**: Configurar lifecycle para eliminar videos antiguos
   ```bash
   # Eliminar automáticamente archivos después de 30 días
   cat > lifecycle.json <<EOF
   {
     "lifecycle": {
       "rule": [
         {
           "action": {"type": "Delete"},
           "condition": {"age": 30}
         }
       ]
     }
   }
   EOF
   gsutil lifecycle set lifecycle.json gs://nanopi-videos-input
   ```

## Monitoreo y Alertas

### Configurar Alertas en Cloud Console

1. Ve a: https://console.cloud.google.com/monitoring/alerting
2. Crea alertas para:
   - **Error rate > 5%** en Cloud Run
   - **Latencia > 300s** (timeout cercano)
   - **Memoria > 90%** de uso

### Dashboard de Monitoreo

Crea un dashboard personalizado con:
- Tasa de videos procesados por hora
- Tasa de caídas detectadas
- Latencia promedio de procesamiento
- Errores y reintentos

## Soporte

Para problemas o preguntas:
- Revisar logs: `gcloud run services logs tail procesador-videos --region=southamerica-west1`
- Documentación GCP: https://cloud.google.com/run/docs
- Documentación Pub/Sub: https://cloud.google.com/pubsub/docs

---

**Última actualización**: 2 de noviembre de 2025
**Versión**: 1.0