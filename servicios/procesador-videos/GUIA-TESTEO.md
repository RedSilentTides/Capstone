# Guía de Testeo - Procesador de Videos con Detección de Caídas

Esta guía te ayudará a testear el sistema completo de procesamiento de videos y detección de caídas.

## 🎯 Objetivo del Sistema

El procesador de videos:
1. Recibe notificaciones cuando se sube un video a Cloud Storage
2. Descarga el video
3. Lo procesa con YOLOv8 para detectar personas
4. Si detecta que la persona está acostada (ancho > alto), marca como caída
5. Notifica al backend para crear una alerta

## 📋 Pre-requisitos para Testear

### 1. Verificar que el servicio esté desplegado

```powershell
gcloud run services describe procesador-videos --region southamerica-west1
```

Si no está desplegado, usa:
```powershell
cd c:\Users\acuri\Documents\Vigilia\Capstone\servicios\procesador-videos
.\deploy-gcp.ps1
```

### 2. Verificar videos de prueba disponibles

Tienes estos videos en tu carpeta:
- `fall.mp4` - Video con caída (para testeo positivo)
- `prueba_1.mp4` - Video de prueba #1
- `prueba_2.mp4` - Video de prueba #2
- `prueba_3.mp4` - Video de prueba #3

## 🧪 Métodos de Testeo

### Método 1: Testeo Rápido - Subir Video Manualmente a GCS

Este es el método más simple para verificar que todo funciona.

#### Paso 1: Subir un video de prueba

```powershell
# Navegar a la carpeta de videos
cd c:\Users\acuri\Documents\Vigilia\Capstone\servicios\procesador-videos

# Subir el video de caída al bucket
gsutil cp fall.mp4 gs://nanopi-videos-input/test-device/fall_test_$(date +%Y%m%d_%H%M%S).mp4
```

**Nota:** Usamos `test-device` como Hardware ID de prueba.

#### Paso 2: Monitorear los logs en tiempo real

En otra terminal PowerShell:

```powershell
gcloud run services logs tail procesador-videos --region southamerica-west1
```

#### Paso 3: Verificar la respuesta esperada

Deberías ver en los logs:

```
📬 Evento recibido para el archivo: gs://nanopi-videos-input/test-device/fall_test_XXXXXXXXX.mp4
Consultando al backend por el ID de hardware: test-device
✅ Backend devolvió el ID de dispositivo numérico: X
Descargando video gs://nanopi-videos-input/test-device/fall_test_XXXXXXXXX.mp4...
✅ Video descargado.
Iniciando procesamiento de video: /tmp/...
🚨 ¡Posible caída detectada! Ancho: XXX, Alto: YYY
Resultado del análisis: Caída detectada
```

Si hay caída detectada, también verás:

```
Notificando al backend sobre la caída...
✅ Backend notificado con éxito. Respuesta: {...}
```

---

### Método 2: Testeo Local - Correr el Procesador en tu PC

Este método te permite debuggear el código directamente.

#### Paso 1: Instalar dependencias

```powershell
cd c:\Users\acuri\Documents\Vigilia\Capstone\servicios\procesador-videos

# Crear entorno virtual (opcional pero recomendado)
python -m venv venv
.\venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt
```

#### Paso 2: Configurar variables de entorno

```powershell
# Configurar las credenciales de GCP
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\ruta\a\tu\service-account-key.json"

# Configurar las variables del servicio
$env:GCP_PROJECT="composed-apogee-475623-p6"
$env:BACKEND_API_URL="https://api-backend-687053793381.southamerica-west1.run.app"
$env:INTERNAL_API_KEY="CAMBIA_ESTA_CLAVE_SECRETA_POR_DEFECTO"
```

#### Paso 3: Crear un script de prueba

Crea un archivo `test_local.py`:

```python
from main import process_video_for_fall_detection, get_or_create_device_id, download_video_from_gcs
import os

# Testear con un video local
print("=== TEST 1: Procesar video local ===")
result = process_video_for_fall_detection("fall.mp4")
print(f"Resultado: {'CAÍDA DETECTADA' if result else 'No se detectó caída'}")

# Testear la función de obtener/crear dispositivo
print("\n=== TEST 2: Obtener ID de dispositivo ===")
try:
    device_id = get_or_create_device_id("test-device-local")
    print(f"Device ID obtenido: {device_id}")
except Exception as e:
    print(f"Error: {e}")

# Testear descarga desde GCS (si ya subiste un video)
print("\n=== TEST 3: Descargar desde GCS ===")
try:
    video_path = download_video_from_gcs("nanopi-videos-input", "test-device/fall.mp4")
    print(f"Video descargado a: {video_path}")
    result = process_video_for_fall_detection(video_path)
    print(f"Resultado: {'CAÍDA DETECTADA' if result else 'No se detectó caída'}")
except Exception as e:
    print(f"Error: {e}")
```

#### Paso 4: Ejecutar el test

```powershell
python test_local.py
```

---

### Método 3: Testeo de Integración Completa - Simular NanoPi

Este método simula el flujo completo como si fuera una NanoPi real.

#### Paso 1: Crear script de simulación

Crea `simulate_nanopi.ps1`:

```powershell
# Simulate NanoPi Upload Script
param(
    [string]$VideoFile = "fall.mp4",
    [string]$HardwareId = "test-nanopi-001"
)

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$destination = "gs://nanopi-videos-input/$HardwareId/video_$timestamp.mp4"

Write-Host "🎥 Simulando upload de NanoPi..." -ForegroundColor Cyan
Write-Host "   Hardware ID: $HardwareId" -ForegroundColor Gray
Write-Host "   Video: $VideoFile" -ForegroundColor Gray
Write-Host "   Destino: $destination" -ForegroundColor Gray
Write-Host ""

# Subir el video
gsutil cp $VideoFile $destination

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Video subido exitosamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Monitoreando logs del procesador..." -ForegroundColor Yellow
    Write-Host "   Presiona Ctrl+C para detener" -ForegroundColor Gray
    Write-Host ""

    # Esperar 2 segundos para que se procese
    Start-Sleep -Seconds 2

    # Mostrar logs
    gcloud run services logs read procesador-videos `
        --region southamerica-west1 `
        --limit 50
} else {
    Write-Host "❌ Error al subir el video" -ForegroundColor Red
}
```

#### Paso 2: Ejecutar la simulación

```powershell
# Testear con video de caída
.\simulate_nanopi.ps1 -VideoFile "fall.mp4" -HardwareId "test-nanopi-001"

# Testear con otro video
.\simulate_nanopi.ps1 -VideoFile "prueba_1.mp4" -HardwareId "test-nanopi-002"
```

---

## 🔍 Verificaciones Importantes

### 1. Verificar que el bucket existe

```powershell
gsutil ls gs://nanopi-videos-input/
```

Si no existe, créalo:

```powershell
gsutil mb -p composed-apogee-475623-p6 -c STANDARD -l southamerica-west1 gs://nanopi-videos-input/
```

### 2. Verificar notificaciones de Pub/Sub

```powershell
gsutil notification list gs://nanopi-videos-input
```

Debe mostrar una notificación hacia `video-upload-topic`.

Si no existe:

```powershell
# Crear el topic
gcloud pubsub topics create video-upload-topic

# Configurar la notificación
gsutil notification create -t video-upload-topic -f json gs://nanopi-videos-input
```

### 3. Verificar la suscripción

```powershell
gcloud pubsub subscriptions describe video-processor-subscription
```

### 4. Verificar que el backend está accesible

```powershell
curl https://api-backend-687053793381.southamerica-west1.run.app/health
```

---

## 📊 Interpretación de Resultados

### ✅ Caso Exitoso - Caída Detectada

**Logs esperados:**
```
🚨 ¡Posible caída detectada! Ancho: 450, Alto: 180
Resultado del análisis: Caída detectada
Notificando al backend sobre la caída...
✅ Backend notificado con éxito
```

**Verificación en el backend:**
1. Ve al frontend web
2. Inicia sesión como cuidador
3. Deberías ver una nueva alerta en "Alertas Recientes"
4. El tipo de alerta debe ser "caída"

### ⚠️ Caso Normal - No Hay Caída

**Logs esperados:**
```
Resultado del análisis: No se detectó caída
ℹ️  No se detectó caída en el video.
```

No se crea ninguna alerta en el backend.

### ❌ Errores Comunes

#### Error: "Permission denied"

```
ERROR: (gcloud.storage.cp) HTTPError 403: Insufficient Permission
```

**Solución:** Verificar que el Service Account tiene permisos:

```powershell
gcloud projects get-iam-policy composed-apogee-475623-p6 `
    --flatten="bindings[].members" `
    --filter="bindings.members:procesador-videos-sa@*"
```

#### Error: "403 Client Error: Forbidden" o "Backend no devolvió un ID de dispositivo"

```
403 Client Error: Forbidden for url: https://api-backend-687053793381.southamerica-west1.run.app/dispositivos/get-or-create
```

**Solución:**
1. Verificar que el `INTERNAL_API_KEY` coincida entre procesador y backend (debe ser exactamente el mismo valor)
2. Verificar que el endpoint `/dispositivos/get-or-create` existe en el backend
3. Asegurar que la variable de entorno use **INTERNAL_API_KEY** (con guiones bajos, NO hyphens)

```powershell
# Verificar con curl (reemplaza "tu-clave-aqui" con tu clave real)
curl -X POST https://api-backend-687053793381.southamerica-west1.run.app/dispositivos/get-or-create `
  -H "X-Internal-Token: CAMBIA_ESTA_CLAVE_SECRETA_POR_DEFECTO" `
  -H "Content-Type: application/json" `
  -d '{"hardware_id":"test-device"}'
```

**Nota:** Si acabas de cambiar la variable de entorno, debes redesplegar el servicio para que tome efecto.

#### Error: "No se encontró 'classes.txt'"

```
❌ Advertencia: No se encontró 'classes.txt'
```

**Solución:** Verificar que el archivo `classes.txt` existe y fue copiado en el build:

```powershell
# Ver contenido del Dockerfile
cat Dockerfile
```

Debe tener: `COPY classes.txt .`

---

## 🎬 Escenarios de Prueba Recomendados

### Test 1: Caída Detectada ✅
```powershell
gsutil cp fall.mp4 gs://nanopi-videos-input/test-fall/video_test.mp4
```
**Resultado esperado:** Alerta creada en el backend

### Test 2: Persona de Pie ❌
```powershell
gsutil cp prueba_1.mp4 gs://nanopi-videos-input/test-standing/video_test.mp4
```
**Resultado esperado:** No se crea alerta

### Test 3: Video sin Personas ❌
```powershell
gsutil cp prueba_2.mp4 gs://nanopi-videos-input/test-empty/video_test.mp4
```
**Resultado esperado:** No se crea alerta

### Test 4: Múltiples Videos Simultáneos 🔄
```powershell
for ($i=1; $i -le 3; $i++) {
    gsutil cp fall.mp4 "gs://nanopi-videos-input/test-multi/video_$i.mp4"
    Start-Sleep -Seconds 1
}
```
**Resultado esperado:** Se procesan todos los videos en paralelo (Cloud Run escala automáticamente)

---

## 📈 Métricas y Monitoreo

### Ver estadísticas del servicio

```powershell
gcloud run services describe procesador-videos `
    --region southamerica-west1 `
    --format="table(status.url, status.conditions.status)"
```

### Ver logs filtrados

```powershell
# Solo errores
gcloud run services logs read procesador-videos `
    --region southamerica-west1 `
    --limit 50 `
    | Select-String "ERROR|❌"

# Solo detecciones de caída
gcloud run services logs read procesador-videos `
    --region southamerica-west1 `
    --limit 50 `
    | Select-String "Caída detectada"
```

### Dashboard en Cloud Console

Ve a: https://console.cloud.google.com/run/detail/southamerica-west1/procesador-videos/metrics

Métricas clave:
- **Request count** - Número de videos procesados
- **Request latency** - Tiempo de procesamiento (debería ser <60s)
- **Error rate** - Tasa de errores (debería ser <1%)
- **Container instances** - Cuántas instancias están ejecutándose

---

## 🧹 Limpieza Después del Testing

### Eliminar videos de prueba

```powershell
gsutil -m rm gs://nanopi-videos-input/test-*/**
```

### Ver todos los videos en el bucket

```powershell
gsutil ls -r gs://nanopi-videos-input/
```

---

## 🚀 Siguientes Pasos

Después de verificar que el procesador funciona:

1. **Configurar NanoPi real:**
   - Editar el script `capture_segments.txt` en la NanoPi
   - Asegurar que usa el bucket correcto: `gs://nanopi-videos-input`
   - Verificar que el Hardware ID se obtiene correctamente de `eth0`

2. **Optimizar el modelo:**
   - Ajustar el threshold de confianza (actualmente 0.80)
   - Ajustar la relación ancho/alto para detección de caídas
   - Considerar usar un modelo más ligero para procesamiento más rápido

3. **Configurar alertas:**
   - Alertas cuando el error rate > 5%
   - Alertas cuando la latencia > 120s
   - Alertas cuando no se procesan videos en 10 minutos

4. **Implementar retry logic:**
   - Si falla el procesamiento, reintentar 3 veces
   - Si falla la notificación al backend, reintentar

---

## 📞 Troubleshooting Avanzado

### Ver variables de entorno del servicio

```powershell
gcloud run services describe procesador-videos `
    --region southamerica-west1 `
    --format="value(spec.template.spec.containers[0].env)"
```

### Ejecutar el servicio localmente con Docker

```powershell
# Build de la imagen
docker build -t procesador-videos-test .

# Ejecutar localmente
docker run -p 8080:8080 `
    -e GCP_PROJECT=composed-apogee-475623-p6 `
    -e BACKEND_API_URL=https://api-backend-687053793381.southamerica-west1.run.app `
    -e INTERNAL_API_KEY=CAMBIA_ESTA_CLAVE_SECRETA_POR_DEFECTO `
    -v ${PWD}:/app `
    procesador-videos-test
```

### Debuggear con logs detallados

Modifica `main.py` temporalmente para agregar más logs:

```python
# Al inicio de process_video_for_fall_detection
print(f"DEBUG: Video path: {video_path}")
print(f"DEBUG: Video exists: {os.path.exists(video_path)}")
print(f"DEBUG: Video size: {os.path.getsize(video_path)} bytes")
```

Redesplegar y probar:

```powershell
gcloud run deploy procesador-videos --source . --region southamerica-west1
```

---

**¡Listo para testear!** 🎉

Empieza con el **Método 1** (más simple) y ve avanzando a los métodos más complejos según necesites.
