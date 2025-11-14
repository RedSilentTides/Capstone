# VigilIA Fall Detection - Edge Processing en NanoPi Neo4

## 📋 Resumen

Este servicio permite procesar detección de caídas **directamente en el dispositivo edge** (NanoPi Neo4) utilizando MediaPipe, en lugar de subir videos completos a la nube.

### Ventajas del procesamiento en edge:
- ⚡ **Menor latencia**: Detección instantánea sin esperar upload/procesamiento cloud
- 💾 **Menor consumo de ancho de banda**: Solo se suben snapshots (~100KB vs ~10MB de video)
- 💰 **Menor costo**: Reduce uso de Cloud Run y Cloud Storage
- 🔒 **Mayor privacidad**: El video no sale del dispositivo

### Arquitectura:

**Antes (Cloud Processing):**
```
Cámara RTSP → NanoPi (grabar 20s) → Upload GCS → Pub/Sub → Cloud Run (MediaPipe) → Backend
Latencia: ~30-60 segundos | Ancho de banda: ~10MB/video
```

**Ahora (Edge Processing):**
```
Cámara RTSP → NanoPi (MediaPipe en tiempo real) → Snapshot GCS → Backend
Latencia: <2 segundos | Ancho de banda: ~100KB/snapshot
```

---

## 🔧 Hardware Requerido

- **NanoPi Neo4** (RK3328 ARM64, 1GB RAM, Armbian)
- **Cámara IP con RTSP**: Dahua IPC-HDBW1320E-W (ya instalada)
- **Red**: Conexión ethernet (eth0)

---

## 📦 Instalación

### 1. Preparar archivos en la NanoPi

Copiar los archivos necesarios desde tu computadora a la NanoPi:

```bash
# Desde tu computadora local
cd servicios/nanopi

# Copiar script principal
scp fall_detection_edge.py usuario@nanopi-ip:/home/usuario/

# Copiar scripts de instalación
scp setup_edge_detection.sh usuario@nanopi-ip:/home/usuario/
scp vigilia-fall-detection.service usuario@nanopi-ip:/home/usuario/
scp vigilia-edge.env.example usuario@nanopi-ip:/home/usuario/
```

### 2. Copiar credenciales de GCP

Necesitas una service account key de Google Cloud con permisos para:
- Cloud Storage (subir snapshots)
- (opcional) Secret Manager si usas secretos

```bash
# Desde tu computadora, copiar las credenciales
scp tu-service-account.json usuario@nanopi-ip:/home/usuario/gcp-key.json
```

### 3. Conectar a la NanoPi y ejecutar instalación

```bash
# SSH a la NanoPi
ssh usuario@nanopi-ip

# Hacer ejecutable el script de instalación
chmod +x setup_edge_detection.sh

# Ejecutar instalación (tardará varios minutos)
./setup_edge_detection.sh
```

Este script instalará:
- Dependencias del sistema (OpenCV, FFmpeg, etc.)
- Entorno virtual de Python
- MediaPipe y librerías necesarias

### 4. Configurar variables de entorno

```bash
# Copiar el template
sudo cp vigilia-edge.env.example /etc/vigilia-edge.env

# Editar con tus valores
sudo nano /etc/vigilia-edge.env
```

Configurar:
- `RTSP_PASS`: Password de la cámara Dahua
- `INTERNAL_API_KEY`: Tu clave API del backend

### 5. Configurar credenciales de GCP

```bash
# Mover credenciales al directorio correcto
sudo mv /home/usuario/gcp-key.json /opt/vigilia-edge/credentials/
sudo chown root:root /opt/vigilia-edge/credentials/gcp-key.json
sudo chmod 600 /opt/vigilia-edge/credentials/gcp-key.json
```

### 6. Verificar que existe /etc/camera_ip.env

Este archivo debería existir del servicio anterior de captura de video:

```bash
cat /etc/camera_ip.env
# Debería mostrar: CAMERA_IP=192.168.1.X

# Si no existe, crearlo:
echo "CAMERA_IP=192.168.1.108" | sudo tee /etc/camera_ip.env
```

### 7. Instalar servicio systemd

```bash
# Copiar el archivo del servicio
sudo cp /home/usuario/vigilia-fall-detection.service /etc/systemd/system/

# Recargar systemd
sudo systemctl daemon-reload

# Habilitar inicio automático
sudo systemctl enable vigilia-fall-detection

# Iniciar el servicio
sudo systemctl start vigilia-fall-detection

# Verificar estado
sudo systemctl status vigilia-fall-detection
```

---

## 🧪 Testing

### Ver logs en tiempo real

```bash
# Logs del servicio
sudo journalctl -u vigilia-fall-detection -f

# Deberías ver:
# ✅ MediaPipe inicializado (modelo lite)
# ✅ Device ID: 123, Adulto Mayor ID: 456
# ✅ Stream RTSP conectado
# 📊 Procesados 100 frames, Estado: ✅ Normal
```

### Probar detección de caída

1. **Simular caída** frente a la cámara (acostarse en el suelo)
2. **Esperar 2-3 segundos** para que se confirme la detección
3. **Verificar logs**:
   ```
   🚨 ¡CAÍDA DETECTADA! Señales: ['tilt', 'hip', 'aspect']
   📸 Snapshot guardado localmente: /tmp/fall_20250113_143022.jpg
   ☁️  Snapshot subido a GCS: gs://nanopi-videos-input/aabbccddeeff/snapshots/fall_20250113_143022.jpg
   ✅ Backend notificado exitosamente
   ✅ Alerta procesada completamente
   ```

4. **Verificar en la app móvil/web** que llegó la alerta al cuidador

### Verificar consumo de recursos

```bash
# Uso de memoria del servicio
sudo systemctl status vigilia-fall-detection | grep Memory

# Debería mostrar: Memory: ~400-600M (dentro del límite de 800M)

# Si consume demasiada memoria, ajustar en fall_detection_edge.py:
# - Aumentar SKIP_FRAMES (ej: 2 = procesar cada 3 frames)
# - Reducir FRAME_WIDTH/HEIGHT (ej: 480x360)
```

---

## 🔄 Comparación: Edge vs Cloud

| Métrica | Cloud Processing | Edge Processing |
|---------|------------------|-----------------|
| **Latencia total** | 30-60 segundos | <2 segundos |
| **Ancho de banda** | ~10MB/video | ~100KB/snapshot |
| **Costo Cloud Run** | $0.0024/request | $0 |
| **Costo GCS** | $0.026/GB | ~90% menos |
| **Privacidad** | Video en cloud | Video en device |
| **RAM NanoPi** | Mínima (solo captura) | Media (~500MB) |

### Recomendación:
- **Edge Processing**: Para detección en tiempo real y bajo ancho de banda
- **Cloud Processing**: Si necesitas análisis post-evento o grabaciones completas

---

## 🛠️ Mantenimiento

### Reiniciar servicio

```bash
sudo systemctl restart vigilia-fall-detection
```

### Detener servicio

```bash
sudo systemctl stop vigilia-fall-detection
```

### Ver estado

```bash
sudo systemctl status vigilia-fall-detection
```

### Actualizar código

```bash
# Copiar nueva versión
scp fall_detection_edge.py usuario@nanopi-ip:/opt/vigilia-edge/

# Reiniciar servicio
sudo systemctl restart vigilia-fall-detection
```

### Limpiar snapshots temporales

```bash
# Los snapshots temporales en /tmp se limpian automáticamente
# después de subir a GCS, pero por si acaso:
sudo rm -f /tmp/fall_*.jpg
```

---

## ⚙️ Ajuste de Parámetros

Si tienes **demasiados falsos positivos** o **falsos negativos**, ajustar en `/opt/vigilia-edge/fall_detection_edge.py`:

```python
# Más estricto (menos falsos positivos):
TORSO_TILT_DEG = 65      # Requiere más inclinación
HIP_Y_RATIO = 0.80       # Cadera más baja
FRAMES_CONFIRM = 12      # Más frames consecutivos

# Menos estricto (detecta caídas más rápido):
TORSO_TILT_DEG = 50      # Menos inclinación necesaria
HIP_Y_RATIO = 0.70       # Cadera menos baja
FRAMES_CONFIRM = 6       # Menos frames consecutivos
```

Después de cambiar, reiniciar: `sudo systemctl restart vigilia-fall-detection`

---

## 🐛 Troubleshooting

### "No se pudo abrir stream RTSP"
- Verificar IP de cámara: `cat /etc/camera_ip.env`
- Verificar password: `sudo nano /etc/vigilia-edge.env`
- Probar conectar con ffmpeg:
  ```bash
  ffmpeg -rtsp_transport tcp -i "rtsp://admin:PASSWORD@IP:554/cam/realmonitor?channel=1&subtype=1" -frames:v 1 test.jpg
  ```

### "Error al guardar snapshot: permission denied"
- Verificar permisos de credenciales GCP:
  ```bash
  ls -la /opt/vigilia-edge/credentials/gcp-key.json
  # Debería ser: -rw------- root root
  ```

### "Memory usage too high"
- Ajustar `SKIP_FRAMES = 2` (procesar cada 3 frames)
- Reducir resolución: `FRAME_WIDTH = 480`, `FRAME_HEIGHT = 360`

### "No detecta caídas"
- Verificar que la persona esté dentro del encuadre de la cámara
- Verificar logs: `sudo journalctl -u vigilia-fall-detection -f`
- Probar con parámetros menos estrictos (ver sección "Ajuste de Parámetros")

---

## 📞 Soporte

Si tienes problemas:
1. Revisar logs: `sudo journalctl -u vigilia-fall-detection -n 100`
2. Verificar estado del servicio: `sudo systemctl status vigilia-fall-detection`
3. Verificar conectividad a backend: `curl -X GET https://api-backend-687053793381.southamerica-west1.run.app/`
