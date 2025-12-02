# VigilIA Edge - Sistema de Deteccion de Caidas en Borde

> Procesamiento de video en tiempo real con IA para deteccion de caidas en adultos mayores.

**Version:** 2.0 Optimizado
**Hardware:** NanoPi Neo4 (ARM64)
**Modelo IA:** MediaPipe BlazePose Lite

---

## Tabla de Contenidos

1. [Arquitectura General](#1-arquitectura-general)
2. [Hardware](#2-hardware)
3. [Stack de Software](#3-stack-de-software)
4. [Flujo de Procesamiento](#4-flujo-de-procesamiento)
5. [Algoritmo de Deteccion](#5-algoritmo-de-deteccion)
6. [Comunicacion con Backend](#6-comunicacion-con-backend)
7. [Configuracion](#7-configuracion)
8. [Instalacion y Despliegue](#8-instalacion-y-despliegue)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Arquitectura General

```
+------------------------------------------------------------------+
|                    ARQUITECTURA VIGILIA EDGE                      |
+------------------------------------------------------------------+

   [Casa del Adulto Mayor]              [Google Cloud Platform]

   +------------+    RTSP    +------------+
   |  Camara    | ---------> |  NanoPi    |
   |  Dahua IP  |   TCP:554  |  Neo4      |
   +------------+            +-----+------+
                                   |
                      Detecta caida con IA
                      en menos de 1 segundo
                                   |
                                   v
                      +------------------------+
                      |   Cloud Storage (GCS)  |
                      |   Snapshots de alertas |
                      +------------------------+
                                   |
                                   v
                      +------------------------+
                      |   Cloud Run (Backend)  |
                      |   API FastAPI          |
                      +------------------------+
                                   |
              +--------------------+--------------------+
              v                    v                    v
        +----------+        +-----------+        +---------+
        | App      |        | WhatsApp  |        | Email   |
        | Movil    |        | Meta API  |        | SendGrid|
        +----------+        +-----------+        +---------+
              |                    |                    |
              +--------------------+--------------------+
                                   v
                      [Cuidador recibe alerta]
```

### Principios de Diseno

| Principio | Implementacion |
|-----------|----------------|
| **Edge Computing** | IA ejecuta localmente, no en nube |
| **Privacidad** | Video nunca sale de la casa |
| **Baja latencia** | Deteccion en < 1 segundo |
| **Resiliencia** | Funciona con internet lento |
| **Bajo costo** | Sin costos de procesamiento cloud |

---

## 2. Hardware

### 2.1 NanoPi Neo4

```
+------------------------------------------+
|            NANOPI NEO4                    |
+------------------------------------------+
| CPU:     ARM Cortex-A72 + A53 (6 cores)  |
| RAM:     1GB DDR3 (limitada)             |
| Storage: microSD 16GB+                   |
| Red:     Gigabit Ethernet (eth0)         |
| USB:     2x USB 3.0                      |
| GPIO:    40 pines                        |
| Consumo: ~5W                             |
| OS:      Ubuntu 20.04 ARM64              |
+------------------------------------------+
```

**Identificacion del dispositivo:**
```python
# Se usa la MAC address de eth0 como ID unico
def get_hardware_id():
    with open('/sys/class/net/eth0/address', 'r') as f:
        mac = f.read().strip().replace(':', '')
        return mac  # Ejemplo: "a1b2c3d4e5f6"
```

### 2.2 Camara Dahua IP

```
+------------------------------------------+
|            CAMARA DAHUA                   |
+------------------------------------------+
| Protocolo: RTSP sobre TCP                |
| Puerto:    554                           |
| Codec:     H.264                         |
| Streams:   Main (1080p) + Sub (360p)     |
| IR:        Vision nocturna               |
| PoE:       Power over Ethernet           |
+------------------------------------------+
```

**URL RTSP:**
```
rtsp://admin:password@192.168.1.100:554/cam/realmonitor?channel=1&subtype=1
                                                                    ^
                                                        subtype=1 = substream (baja res)
```

---

## 3. Stack de Software

### 3.1 Diagrama de Capas

```
+------------------------------------------------------------------+
|                    STACK DE SOFTWARE                              |
+------------------------------------------------------------------+

CAPA 4: Aplicacion
+--------------------------------------------------+
|  fall_detection_edge.py                          |
|  - Logica de deteccion de caidas                 |
|  - Comunicacion con backend                      |
|  - Upload de snapshots                           |
+--------------------------------------------------+
                    |
                    v
CAPA 3: Librerias de IA/Vision
+--------------------------------------------------+
|  MediaPipe          |  OpenCV (cv2)              |
|  - BlazePose Lite   |  - Captura RTSP            |
|  - 33 landmarks     |  - Procesamiento frames    |
|  - Inferencia ARM   |  - Conversion colores      |
+--------------------------------------------------+
                    |
                    v
CAPA 2: Backend de Video
+--------------------------------------------------+
|  FFmpeg                                          |
|  - Decodificacion H.264                          |
|  - Protocolo RTSP/TCP                            |
|  - Buffer management                             |
+--------------------------------------------------+
                    |
                    v
CAPA 1: Sistema Operativo
+--------------------------------------------------+
|  Ubuntu ARM64 + systemd                          |
|  - Sockets TCP                                   |
|  - Gestion de servicios                          |
|  - Variables de entorno                          |
+--------------------------------------------------+
                    |
                    v
CAPA 0: Hardware
+--------------------------------------------------+
|  NanoPi Neo4 (ARM Cortex-A72)                    |
|  - Ethernet eth0                                 |
|  - microSD storage                               |
+--------------------------------------------------+
```

### 3.2 Dependencias Python

| Libreria | Version | Uso |
|----------|---------|-----|
| `opencv-python` | 4.x | Captura video RTSP, procesamiento de frames |
| `mediapipe` | 0.10.x | Modelo BlazePose para deteccion de pose |
| `numpy` | 1.x | Operaciones numericas rapidas |
| `google-cloud-storage` | 2.x | Upload de snapshots a GCS |
| `requests` | 2.x | Comunicacion HTTP con backend |

### 3.3 Dependencias del Sistema

```bash
# FFmpeg (backend de OpenCV)
apt install ffmpeg libavcodec-dev libavformat-dev

# Herramientas de red
apt install netcat nmap

# Python
apt install python3 python3-pip python3-venv
```

---

## 4. Flujo de Procesamiento

### 4.1 Loop Principal

```
+------------------------------------------------------------------+
|                    LOOP DE PROCESAMIENTO                          |
+------------------------------------------------------------------+

while True:
    |
    v
+-------------------+
| cap.read()        |  <-- Lee 1 frame del buffer RTSP
| ret, frame        |      frame = numpy array (240, 320, 3) BGR
+--------+----------+
         |
         v
+-------------------+
| SKIP_FRAMES=2     |  <-- Procesa cada 3er frame (optimizacion)
| frame_count % 3   |      Camara 30 FPS -> Procesamos 10 FPS
+--------+----------+
         |
         v
+-------------------+
| cv2.cvtColor()    |  <-- Convierte BGR -> RGB (MediaPipe requiere)
| BGR -> RGB        |      Operacion en memoria, muy rapida
+--------+----------+
         |
         v
+-------------------+
| pose.process()    |  <-- MEDIAPIPE: Inferencia de IA (~35ms)
| (MediaPipe)       |      Input: RGB 320x240
+--------+----------+      Output: 33 landmarks con coordenadas
         |
         v
+-------------------+
| extract_pose_     |  <-- Extrae metricas de los landmarks
| metrics()         |      - Angulo torso
+--------+----------+      - Posicion cadera
         |                 - Bounding box
         v
+-------------------+
| Algoritmo de      |  <-- Logica de deteccion de caida
| deteccion         |      - Running sums (suavizado)
+--------+----------+      - Histeresis (confirmacion)
         |
         v
+-------------------+
| Si ALERTA:        |  <-- Accion cuando se detecta caida
| save_snapshot     |      - Copia frame
| _async()          |      - Thread separado sube a GCS
+-------------------+      - Notifica backend
```

### 4.2 Configuracion de Captura RTSP

```python
# Variables de entorno para FFmpeg (optimizado para 1GB RAM)
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp|"        # TCP mas estable que UDP
    "buffer_size;256000|"        # 256KB buffer (minimo)
    "max_delay;2000000|"         # 2 segundos tolerancia
    "reorder_queue_size;5|"      # Cola minima
    "stimeout;10000000"          # Timeout 10s
)

# Crear captura
cap = cv2.VideoCapture(camera_url, cv2.CAP_FFMPEG)

# Configurar para minima memoria
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)       # Solo 1 frame en buffer
cap.set(cv2.CAP_PROP_FPS, 10)             # Limitar a 10 FPS
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 320)    # 320px ancho
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 240)   # 240px alto
```

### 4.3 MediaPipe Pose

```python
# Inicializacion optimizada para ARM
pose = mp_pose.Pose(
    static_image_mode=False,      # Modo video (usa tracking entre frames)
    model_complexity=0,           # 0=Lite, 1=Full, 2=Heavy
    smooth_landmarks=True,        # Suaviza movimientos
    enable_segmentation=False,    # No necesitamos mascara
    min_detection_confidence=0.5, # 50% confianza minima
    min_tracking_confidence=0.5   # 50% para tracking
)
```

**Landmarks detectados:**
```
         0 (nose)
            |
      11 --+-- 12   <- Hombros (LEFT_SHOULDER, RIGHT_SHOULDER)
            |
            |
      23 --+-- 24   <- Caderas (LEFT_HIP, RIGHT_HIP)
           / \
          /   \
        25    26    <- Rodillas
        |      |
       27     28    <- Tobillos
```

---

## 5. Algoritmo de Deteccion

### 5.1 Tres Senales de Caida

```
+------------------------------------------------------------------+
|                    METRICAS DE DETECCION                          |
+------------------------------------------------------------------+

SENAL 1: INCLINACION DEL TORSO (TORSO_TILT_DEG = 50)
---------------------------------------------------------

     mid_shoulder (promedio de hombros)
          *
          |\
          | \  angulo = atan2(|dx|, dy)
          |  \
          |   \
          *    --> Si angulo > 50 grados = senal "tilt"
     mid_hip (promedio de caderas)


SENAL 2: POSICION DE CADERA (HIP_Y_RATIO = 0.70)
---------------------------------------------------------

  +---------------------+  0%
  |                     |
  |                     |  30%  <- Persona parada
  |        *            |
  |      (cadera)       |
  |                     |  70%  <- UMBRAL
  |                     |
  |        *            |  85%  <- Persona caida (senal "hip")
  +---------------------+  100%


SENAL 3: RELACION DE ASPECTO (ASPECT_THRESHOLD = 1.5)
---------------------------------------------------------

  Persona PARADA:          Persona CAIDA:
  +----+                   +------------------+
  |    |  alto > ancho     |                  |  ancho > alto
  |    |  AR = 0.5         |                  |  AR = 2.0
  |    |                   +------------------+
  |    |
  +----+                   Si AR > 1.5 = senal "aspect"
```

### 5.2 Logica de Confirmacion

```python
# Parametros
FRAMES_CONFIRM = 3    # Frames consecutivos para confirmar
SMOOTH_WINDOW = 2     # Ventana de suavizado

# Evaluacion de senales
pose_signals = []
if tilt_smooth > 50:    pose_signals.append("tilt")
if hip_smooth > 0.70:   pose_signals.append("hip")
if ar_smooth > 1.5:     pose_signals.append("aspect")

# Requiere AL MENOS 2 de 3 senales
frame_has_fall_signal = len(pose_signals) >= 2

# Histeresis con contador
if frame_has_fall_signal:
    fall_counter += 1        # Incrementa si hay senal
else:
    fall_counter -= 2        # Decrementa 2x mas rapido (reset rapido)

fall_counter = max(0, min(fall_counter, 6))  # Limites

# ALERTA si contador >= 3 frames consecutivos
alert_active = fall_counter >= FRAMES_CONFIRM
```

### 5.3 Timeline de Deteccion

```
Frame:  1   2   3   4   5   6   7   8   9
Senal:  Si  Si  Si  No  No  No  Si  Si  Si
Count:  1   2   3   1   0   0   1   2   3
Alerta: No  No  SI  No  No  No  No  No  SI
              ^                         ^
        CAIDA DETECTADA           CAIDA DETECTADA
```

### 5.4 Optimizacion: Running Sums

```python
# En lugar de recalcular sum() cada frame O(n):
tilt_smooth = sum(tilt_hist) / len(tilt_hist)  # LENTO

# Usamos sumas incrementales O(1):
if len(tilt_hist) >= SMOOTH_WINDOW:
    tilt_sum -= tilt_hist[0]   # Resta valor que sale
tilt_hist.append(torso_angle)
tilt_sum += torso_angle        # Suma nuevo valor
tilt_smooth = tilt_sum / len(tilt_hist)  # RAPIDO
```

---

## 6. Comunicacion con Backend

### 6.1 Registro de Dispositivo

```
POST /dispositivos/get-or-create

Headers:
  X-Internal-Token: {INTERNAL_API_KEY}
  Content-Type: application/json

Request:
{
  "hardware_id": "a1b2c3d4e5f6"
}

Response:
{
  "id": 123,
  "adulto_mayor_id": 456
}
```

### 6.2 Verificacion de Cooldown

```
POST /dispositivos/check-cooldown

Headers:
  X-Internal-Token: {INTERNAL_API_KEY}
  Content-Type: application/json

Request:
{
  "dispositivo_id": 123,
  "adulto_mayor_id": 456
}

Response:
{
  "cooldown_activo": false,
  "cooldown_expira_en_segundos": 0
}
```

### 6.3 Notificacion de Caida

```
POST /eventos-caida/notificar

Headers:
  X-Internal-Token: {INTERNAL_API_KEY}
  Content-Type: application/json

Request:
{
  "dispositivo_id": 123,
  "timestamp_caida": "2025-11-30T15:34:22.123456+00:00",
  "url_video_almacenado": "",
  "snapshot_url": "gs://nanopi-videos-input/a1b2c3/snapshots/fall_20251130_153422.jpg"
}
```

### 6.4 Upload Asincrono a GCS

```
+------------------------------------------------------------------+
|                    FLUJO DE UPLOAD                                |
+------------------------------------------------------------------+

THREAD PRINCIPAL (no se bloquea)
+-----------------------------------------------+
|  1. frame_copy = frame.copy()                 |
|  2. save_snapshot_async(frame_copy, ...)      |
|  3. Continua procesando video                 |
+-----------------------------------------------+
                    |
                    | Thread(daemon=True).start()
                    v
THREAD SECUNDARIO (asincrono)
+-----------------------------------------------+
|  1. cv2.imwrite() -> /tmp/fall_xxx.jpg        |
|  2. storage.upload() -> gs://bucket/...       |
|  3. os.remove() -> limpia /tmp                |
|  4. POST /eventos-caida/notificar             |
+-----------------------------------------------+
```

---

## 7. Configuracion

### 7.1 Variables de Entorno

Archivo: `/etc/vigilia-edge.env`

```bash
# === CAMARA RTSP ===
RTSP_USER=admin
RTSP_PASS=tu_password_aqui
RTSP_PORT=554
RTSP_PATH=/cam/realmonitor?channel=1&subtype=1

# === GOOGLE CLOUD ===
BUCKET_NAME=nanopi-videos-input

# === BACKEND API ===
BACKEND_API_URL=https://api-backend-687053793381.southamerica-west1.run.app
INTERNAL_API_KEY=tu_clave_api_interna_aqui

# === PARAMETROS DE DETECCION (opcional) ===
# TORSO_TILT_DEG=50      # Angulo de inclinacion (grados)
# HIP_Y_RATIO=0.70       # Ratio de posicion de cadera
# ASPECT_THRESHOLD=1.5   # Umbral de aspect ratio
# FRAMES_CONFIRM=3       # Frames para confirmar caida
# ALERT_COOLDOWN_SEC=60  # Cooldown entre alertas (segundos)
```

### 7.2 Valores por Defecto

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `RTSP_USER` | admin | Usuario de camara |
| `RTSP_PASS` | Filianore.1 | Password de camara |
| `CAMERA_IP` | (desde /etc/camera_ip.env) | IP de la camara |
| `RTSP_PORT` | 554 | Puerto RTSP |
| `BUCKET_NAME` | nanopi-videos-input | Bucket GCS |
| `TORSO_TILT_DEG` | 50 | Angulo de inclinacion |
| `HIP_Y_RATIO` | 0.70 | Ratio de cadera |
| `ASPECT_THRESHOLD` | 1.5 | Umbral aspect ratio |
| `FRAMES_CONFIRM` | 3 | Frames para confirmar |
| `SMOOTH_WINDOW` | 2 | Ventana de suavizado |
| `FRAME_WIDTH` | 320 | Ancho de frame |
| `FRAME_HEIGHT` | 240 | Alto de frame |
| `SKIP_FRAMES` | 2 | Frames a saltar |
| `ALERT_COOLDOWN_SEC` | 60 | Cooldown normal |
| `ALERT_TIMEOUT_SEC` | 60 | Timeout de alerta |

### 7.3 Servicio systemd

Archivo: `/etc/systemd/system/vigilia-fall-detection.service`

```ini
[Unit]
Description=VigilIA Fall Detection Edge Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/vigilia-edge
EnvironmentFile=/etc/vigilia-edge.env
Environment="GOOGLE_APPLICATION_CREDENTIALS=/opt/vigilia-edge/credentials/gcp-key.json"

ExecStart=/opt/vigilia-edge/venv/bin/python /opt/vigilia-edge/fall_detection_edge.py

Restart=always
RestartSec=10

TimeoutStartSec=60
TimeoutStopSec=30

StandardOutput=journal
StandardError=journal
SyslogIdentifier=vigilia-edge

[Install]
WantedBy=multi-user.target
```

---

## 8. Instalacion y Despliegue

### 8.1 Preparacion del Sistema

```bash
# Actualizar sistema
apt update && apt upgrade -y

# Instalar dependencias
apt install -y python3 python3-pip python3-venv ffmpeg netcat

# Crear directorio de trabajo
mkdir -p /opt/vigilia-edge/credentials
cd /opt/vigilia-edge

# Crear entorno virtual
python3 -m venv venv
source venv/bin/activate

# Instalar dependencias Python
pip install opencv-python mediapipe numpy google-cloud-storage requests
```

### 8.2 Configurar Credenciales GCP

```bash
# Copiar archivo de credenciales
cp nanopi-key.json /opt/vigilia-edge/credentials/gcp-key.json
chmod 600 /opt/vigilia-edge/credentials/gcp-key.json
```

### 8.3 Escanear Camara

```bash
# Ejecutar script de escaneo
chmod +x scan_camera.sh
./scan_camera.sh

# Verificar IP guardada
cat /etc/camera_ip.env
```

### 8.4 Configurar Variables de Entorno

```bash
# Copiar template
cp vigilia-edge.env.example /etc/vigilia-edge.env

# Editar con credenciales reales
nano /etc/vigilia-edge.env
```

### 8.5 Instalar Servicio

```bash
# Copiar archivo de servicio
cp vigilia-fall-detection.service /etc/systemd/system/

# Recargar systemd
systemctl daemon-reload

# Habilitar inicio automatico
systemctl enable vigilia-fall-detection

# Iniciar servicio
systemctl start vigilia-fall-detection

# Verificar estado
systemctl status vigilia-fall-detection
```

### 8.6 Ver Logs

```bash
# Logs en tiempo real
journalctl -u vigilia-fall-detection -f

# Ultimas 100 lineas
journalctl -u vigilia-fall-detection -n 100
```

---

## 9. Troubleshooting

### 9.1 Problemas Comunes

| Problema | Causa | Solucion |
|----------|-------|----------|
| "No se pudo abrir stream RTSP" | IP incorrecta o camara apagada | Ejecutar `scan_camera.sh` |
| "Error al leer frame" | Conexion inestable | Verificar red, reiniciar servicio |
| "Error al obtener device ID" | Backend no accesible | Verificar URL y token |
| "Error en MediaPipe" | Memoria insuficiente | Reiniciar servicio, verificar RAM |
| FPS muy bajo (< 5) | CPU sobrecargada | Aumentar SKIP_FRAMES |

### 9.2 Comandos de Diagnostico

```bash
# Verificar conectividad con camara
ping -c 3 $(cat /etc/camera_ip.env | grep CAMERA_IP | cut -d= -f2)

# Probar stream RTSP
ffprobe rtsp://admin:password@IP:554/cam/realmonitor?channel=1&subtype=1

# Verificar uso de memoria
free -h

# Verificar uso de CPU
top -p $(pgrep -f fall_detection)

# Verificar conectividad con backend
curl -X GET https://api-backend-687053793381.southamerica-west1.run.app/health
```

### 9.3 Reiniciar Servicio

```bash
# Reinicio suave
systemctl restart vigilia-fall-detection

# Reinicio completo (si hay problemas de memoria)
systemctl stop vigilia-fall-detection
sync && echo 3 > /proc/sys/vm/drop_caches  # Limpiar cache
systemctl start vigilia-fall-detection
```

---

## Estructura de Archivos

```
nanopi/
|-- fall_detection_edge.py          # Script principal de deteccion
|-- scan_camera.txt                  # Script bash para escaneo de camaras
|-- vigilia-fall-detection.service  # Archivo de servicio systemd
|-- vigilia-edge.env.example        # Template de variables de entorno
|-- nanopi-key.json                 # Credenciales GCP (NO commitear)
|-- README.md                       # Esta documentacion
|-- Legacy/                         # Versiones anteriores (backup)
    |-- fall_detection_edge Backup.py
    |-- capture_segments.txt
    +-- capture_segments copy.txt
```

---

## Timeline de un Evento Real

```
TIEMPO      EVENTO                                    COMPONENTE
------------------------------------------------------------------------
0ms         Adulto mayor comienza a caer              [Mundo real]
50ms        Frame capturado por camara                [Camara Dahua]
52ms        Frame llega via RTSP TCP                  [FFmpeg]
53ms        cv2.read() retorna frame                  [OpenCV]
55ms        cv2.cvtColor BGR->RGB                     [OpenCV]
56-90ms     pose.process() - Inferencia IA            [MediaPipe]
95ms        extract_pose_metrics()                    [Python]
100ms       Evaluacion de senales (2/3 detectadas)    [Python]
102ms       fall_counter++ (frame 1 de 3)             [Python]

[... Frames 2 y 3 con mismas senales ...]

250ms       fall_counter=3 -> ALERTA ACTIVA           [Python]
255ms       Verificar cooldown extendido              [Backend API]
260ms       frame.copy() + Thread.start()             [Python]
300ms       cv2.imwrite() guarda JPEG                 [Thread]
350ms       storage.upload() sube a GCS               [Thread]
800ms       POST /eventos-caida/notificar             [Thread]
850ms       Backend procesa alerta                    [Cloud Run]
900ms       Push notification enviada                 [Expo]
1000ms      WhatsApp enviado                          [Meta API]
1100ms      Email enviado                             [SendGrid]
------------------------------------------------------------------------
TOTAL: ~1.1 segundos desde caida hasta notificacion
```

---

## Metricas de Rendimiento

| Metrica | Valor Tipico |
|---------|--------------|
| FPS procesados | 6.5 - 7.0 |
| Latencia deteccion | ~250ms (3 frames) |
| Latencia total (hasta notificacion) | ~1.1s |
| Uso de RAM | ~400MB de 1GB |
| Uso de CPU | ~60-70% |
| Tamano snapshot | ~15-30KB (JPEG) |

---

## Seguridad

- **Video**: NUNCA se transmite a la nube, solo se procesa localmente
- **Snapshots**: Solo se guardan cuando hay alerta confirmada
- **Credenciales**: Service account con permisos minimos
- **Comunicacion**: HTTPS para todas las llamadas al backend
- **Token interno**: Autenticacion entre edge y backend

---

## Contacto y Soporte

- **Repositorio**: VigiliaCode/servicios/nanopi
- **Issues**: GitHub Issues del proyecto
- **Logs**: `journalctl -u vigilia-fall-detection -f`

---

*Documentacion actualizada: Noviembre 2025*
