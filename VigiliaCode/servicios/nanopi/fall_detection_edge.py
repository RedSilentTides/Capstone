#!/usr/bin/env python3
"""
Detección de Caídas en Edge con MediaPipe
Para NanoPi Neo4 + Cámara Dahua RTSP

Optimizado para ARM64 y recursos limitados (1GB RAM)

OPTIMIZACIONES DE VELOCIDAD v2.0:
- Running sums para smoothing (evita recalcular sum() cada frame)
- Upload asíncrono de snapshots (NO bloquea detección)
- Procesamiento de landmarks optimizado con numpy
- Cálculos inline para reducir overhead de funciones
- Garbage collection menos frecuente (cada 1000 frames)
- FRAMES_CONFIRM=3 para detección ultra-rápida (~0.5s)
"""

import cv2
import math
import os
import sys
import time
import json
import requests
import gc  # Garbage collector para liberar memoria
import numpy as np
from collections import deque
from datetime import datetime, timezone
from google.cloud import storage
from threading import Thread
import mediapipe as mp

# ===========================
# CONFIGURACIÓN
# ===========================

# Cámara RTSP
RTSP_USER = os.environ.get("RTSP_USER", "admin")
RTSP_PASS = os.environ.get("RTSP_PASS", "Filianore.1")
CAMERA_IP = os.environ.get("CAMERA_IP", "")  # Se carga desde /etc/camera_ip.env
RTSP_PORT = os.environ.get("RTSP_PORT", "554")
RTSP_PATH = os.environ.get("RTSP_PATH", "/cam/realmonitor?channel=1&subtype=1")  # subtype=1 = substream (menor RAM/bandwidth)

# Google Cloud
BUCKET_NAME = os.environ.get("BUCKET_NAME", "nanopi-videos-input")
BACKEND_API_URL = os.environ.get("BACKEND_API_URL", "https://api-backend-687053793381.southamerica-west1.run.app")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "CAMBIA_ESTA_CLAVE_SECRETA_POR_DEFECTO_TEST2")

# Parámetros de detección (optimizados para velocidad + estabilidad)
TORSO_TILT_DEG = 50      # inclinación torso (más sensible)
HIP_Y_RATIO = 0.70       # cadera por debajo del 70% (más sensible)
ASPECT_THRESHOLD = 1.5   # ancho/alto > 1.5 → acostado (más sensible)
FRAMES_CONFIRM = 3       # frames consecutivos (ultra-rápido)
SMOOTH_WINDOW = 2        # suavizado mínimo para estabilidad

# Procesamiento de video (OPTIMIZADO PARA VELOCIDAD - configuración probada estable)
FRAME_WIDTH = 320        # Balance rendimiento/precisión (probado estable a 6.6-6.8 FPS)
FRAME_HEIGHT = 240
SKIP_FRAMES = 2          # Procesar cada 3er frame (balance velocidad/precisión)

# Cooldown entre alertas (evitar spam)
ALERT_COOLDOWN_SEC = 60  # 60 segundos entre alertas
ALERT_TIMEOUT_SEC = 60   # Tiempo máximo en estado de alerta antes de reset automático (60s, se reduce a 10s con "Ya voy")

# Hardware ID
def get_hardware_id():
    """Obtiene la MAC address de eth0 como ID único"""
    try:
        with open('/sys/class/net/eth0/address', 'r') as f:
            mac = f.read().strip().replace(':', '')
            return mac
    except Exception as e:
        print(f"⚠️  No se pudo leer MAC de eth0: {e}")
        return "unknown_device"

HARDWARE_ID = get_hardware_id()

# ===========================
# MEDIAPIPE SETUP (Optimizado)
# ===========================
print("🤖 Inicializando MediaPipe Pose (modo lite para ARM)...")
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils

# Configuración optimizada para ARM/edge
pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=0,  # 0 = lite (más rápido en ARM)
    smooth_landmarks=True,
    enable_segmentation=False,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)
print("✅ MediaPipe inicializado (modelo lite)")

# ===========================
# FUNCIONES AUXILIARES
# ===========================

def log(msg):
    """Log con timestamp"""
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)

def load_camera_ip():
    """Carga la IP de la cámara desde el archivo de entorno"""
    global CAMERA_IP
    try:
        with open('/etc/camera_ip.env', 'r') as f:
            for line in f:
                if line.startswith('CAMERA_IP='):
                    CAMERA_IP = line.split('=')[1].strip()
                    return True
    except Exception as e:
        log(f"⚠️  No se pudo cargar IP de cámara: {e}")
    return False

def get_camera_url():
    """Construye la URL RTSP"""
    if not CAMERA_IP:
        return None
    return f"rtsp://{RTSP_USER}:{RTSP_PASS}@{CAMERA_IP}:{RTSP_PORT}{RTSP_PATH}"

def angle_from_vertical(p_top, p_bottom):
    """Ángulo respecto a la vertical"""
    if p_top is None or p_bottom is None:
        return None
    (x1, y1) = p_top
    (x2, y2) = p_bottom
    dx = x2 - x1
    dy = y2 - y1
    if abs(dx) < 1e-6 and abs(dy) < 1e-6:
        return None
    return math.degrees(math.atan2(abs(dx), max(1e-6, dy)))

def midpoint(p1, p2):
    if p1 is None or p2 is None:
        return None
    return ((p1[0] + p2[0]) // 2, (p1[1] + p2[1]) // 2)

def to_px(lm, W, H):
    return (int(lm.x * W), int(lm.y * H)), lm.visibility

def extract_pose_metrics(frame, results):
    """Extrae métricas de postura (OPTIMIZADO para velocidad)"""
    if not results or not results.pose_landmarks:
        return None, None, None, None, None

    H, W = frame.shape[:2]
    lms = results.pose_landmarks.landmark

    # Índices de landmarks clave
    LS, RS, LH, RH = 11, 12, 23, 24
    VMIN = 0.4

    try:
        # Extraer landmarks clave directamente (sin función auxiliar)
        ls_lm, rs_lm, lh_lm, rh_lm = lms[LS], lms[RS], lms[LH], lms[RH]

        # Convertir a píxeles solo si visibilidad suficiente
        ls_xy = (int(ls_lm.x * W), int(ls_lm.y * H)) if ls_lm.visibility >= VMIN else None
        rs_xy = (int(rs_lm.x * W), int(rs_lm.y * H)) if rs_lm.visibility >= VMIN else None
        lh_xy = (int(lh_lm.x * W), int(lh_lm.y * H)) if lh_lm.visibility >= VMIN else None
        rh_xy = (int(rh_lm.x * W), int(rh_lm.y * H)) if rh_lm.visibility >= VMIN else None

        # Calcular puntos medios inline
        mid_shoulder = ((ls_xy[0] + rs_xy[0]) // 2, (ls_xy[1] + rs_xy[1]) // 2) if (ls_xy and rs_xy) else None
        mid_hip = ((lh_xy[0] + rh_xy[0]) // 2, (lh_xy[1] + rh_xy[1]) // 2) if (lh_xy and rh_xy) else None

        # Calcular ángulo de torso inline
        torso_angle = None
        if mid_shoulder and mid_hip:
            dx = abs(mid_hip[0] - mid_shoulder[0])
            dy = mid_hip[1] - mid_shoulder[1]
            if dy > 1e-6:  # Evitar división por cero
                torso_angle = math.degrees(math.atan2(dx, dy))

        # Hip Y ratio
        hip_y_ratio = (mid_hip[1] / float(H)) if mid_hip else None

        # BBox aproximada usando numpy para velocidad
        # Extraer solo coordenadas visibles en un solo paso
        visible_points = [(int(lm.x * W), int(lm.y * H)) for lm in lms if lm.visibility >= VMIN]

        bbox = None
        if visible_points:
            # Usar numpy para min/max rápido
            points_array = np.array(visible_points)
            x_min, y_min = points_array.min(axis=0)
            x_max, y_max = points_array.max(axis=0)

            # Padding
            pad = 20
            x1 = max(0, x_min - pad)
            y1 = max(0, y_min - pad)
            x2 = min(W - 1, x_max + pad)
            y2 = min(H - 1, y_max + pad)

            if x2 > x1 and y2 > y1:
                bbox = (x1, y1, x2, y2)

        return mid_shoulder, mid_hip, torso_angle, hip_y_ratio, bbox

    except Exception:
        return None, None, None, None, None

def save_snapshot_to_gcs(frame):
    """Guarda snapshot en GCS y retorna URL (síncrono - solo para thread)"""
    try:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{HARDWARE_ID}/snapshots/fall_{ts}.jpg"
        local_path = f"/tmp/fall_{ts}.jpg"

        # Guardar localmente
        cv2.imwrite(local_path, frame)
        log(f"📸 Snapshot guardado localmente: {local_path}")

        # Subir a GCS
        storage_client = storage.Client()
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(filename)
        blob.upload_from_filename(local_path)

        # Limpiar
        os.remove(local_path)

        url = f"gs://{BUCKET_NAME}/{filename}"
        log(f"☁️  Snapshot subido a GCS: {url}")
        return url
    except Exception as e:
        log(f"❌ Error al guardar snapshot: {e}")
        return None

def save_snapshot_async(frame, dispositivo_id, adulto_mayor_id):
    """Guarda snapshot y notifica backend en thread separado (NO BLOQUEA detección)"""
    def _async_upload():
        try:
            # Upload snapshot
            snapshot_url = save_snapshot_to_gcs(frame)

            # Notify backend
            if dispositivo_id and snapshot_url:
                notify_backend(dispositivo_id, adulto_mayor_id, snapshot_url)
        except Exception as e:
            log(f"❌ Error en upload asíncrono: {e}")

    # Ejecutar en thread separado para no bloquear
    Thread(target=_async_upload, daemon=True).start()
    log("🚀 Upload y notificación iniciados en background")

def get_or_create_device_id():
    """Obtiene o crea dispositivo en backend"""
    endpoint = f"{BACKEND_API_URL}/dispositivos/get-or-create"
    headers = {
        "X-Internal-Token": INTERNAL_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {"hardware_id": HARDWARE_ID}

    try:
        response = requests.post(endpoint, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
        data = response.json()
        return data.get("id"), data.get("adulto_mayor_id")
    except Exception as e:
        log(f"❌ Error al obtener device ID: {e}")
        return None, None

def check_cooldown_extendido(dispositivo_id, adulto_mayor_id):
    """Verifica si hay cooldown extendido activo (cuidador confirmo "Ya voy")"""
    endpoint = f"{BACKEND_API_URL}/dispositivos/check-cooldown"
    headers = {
        "X-Internal-Token": INTERNAL_API_KEY,
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            endpoint,
            json={"dispositivo_id": dispositivo_id, "adulto_mayor_id": adulto_mayor_id},
            headers=headers,
            timeout=5
        )
        response.raise_for_status()
        data = response.json()

        if data.get("cooldown_activo"):
            segundos_restantes = data.get("cooldown_expira_en_segundos", 0)
            log(f"[COOLDOWN] Cooldown extendido activo: {segundos_restantes}s restantes (cuidador confirmo asistencia)")
            return True
        return False
    except Exception as e:
        log(f"[WARN] Error al verificar cooldown: {e} (asumiendo sin cooldown)")
        return False


def reset_cooldown_extendido(dispositivo_id, adulto_mayor_id):
    """Resetea el cooldown extendido al iniciar el servicio (util para pruebas)"""
    endpoint = f"{BACKEND_API_URL}/dispositivos/reset-cooldown"
    headers = {
        "X-Internal-Token": INTERNAL_API_KEY,
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            endpoint,
            json={"dispositivo_id": dispositivo_id, "adulto_mayor_id": adulto_mayor_id},
            headers=headers,
            timeout=5
        )
        response.raise_for_status()
        data = response.json()

        if data.get("success"):
            cooldowns_limpiados = data.get("cooldowns_limpiados", 0)
            if cooldowns_limpiados > 0:
                log(f"[OK] Cooldown extendido reseteado ({cooldowns_limpiados} alertas limpiadas)")
            else:
                log("[OK] No habia cooldown activo para resetear")
            return True
        return False
    except Exception as e:
        log(f"[WARN] Error al resetear cooldown: {e}")
        return False


def notify_backend(dispositivo_id, adulto_mayor_id, snapshot_url):
    """Notifica caída al backend"""
    endpoint = f"{BACKEND_API_URL}/eventos-caida/notificar"
    headers = {
        "X-Internal-Token": INTERNAL_API_KEY,
        "Content-Type": "application/json"
    }

    payload = {
        "dispositivo_id": dispositivo_id,
        "timestamp_caida": datetime.now(timezone.utc).isoformat(),
        "url_video_almacenado": "",  # No enviamos video en edge
        "snapshot_url": snapshot_url
    }

    if adulto_mayor_id:
        payload["adulto_mayor_id"] = adulto_mayor_id

    try:
        response = requests.post(endpoint, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
        log(f"✅ Backend notificado exitosamente")
        return True
    except Exception as e:
        log(f"❌ Error al notificar backend: {e}")
        return False

# ===========================
# MAIN LOOP
# ===========================

def main():
    log("="*50)
    log("🚀 DETECCIÓN DE CAÍDAS EN EDGE - MediaPipe")
    log(f"🔧 Hardware ID: {HARDWARE_ID}")
    log(f"📦 Bucket: gs://{BUCKET_NAME}/{HARDWARE_ID}/")
    log(f"🎯 Backend: {BACKEND_API_URL}")
    log("="*50)

    # Cargar IP de cámara
    if not load_camera_ip():
        log("❌ No se pudo cargar IP de cámara. Ejecuta scan_camera.sh primero.")
        sys.exit(1)

    camera_url = get_camera_url()
    log(f"📹 Cámara: rtsp://{RTSP_USER}:***@{CAMERA_IP}:{RTSP_PORT}{RTSP_PATH}")

    # Obtener device ID
    dispositivo_id, adulto_mayor_id = get_or_create_device_id()
    if not dispositivo_id:
        log("[WARN] No se pudo obtener device ID, continuando sin backend...")
    else:
        log(f"[OK] Device ID: {dispositivo_id}, Adulto Mayor ID: {adulto_mayor_id}")
        # Resetear cooldown extendido al iniciar (util para pruebas con stakeholders)
        log("[INFO] Reseteando cooldown extendido para pruebas...")
        reset_cooldown_extendido(dispositivo_id, adulto_mayor_id)

    # Conectar a camara RTSP (ULTRA-OPTIMIZADO para RAM limitada)
    log("🔌 Conectando a stream RTSP (substream, ultra-ligero)...")

    # Configurar variables de entorno para FFmpeg (mínimo uso de memoria)
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
        "rtsp_transport;tcp|"
        "buffer_size;256000|"           # Buffer muy reducido (mínima RAM)
        "max_delay;2000000|"            # Mayor tolerancia a delay
        "reorder_queue_size;5|"         # Queue mínima
        "stimeout;10000000"             # Timeout de socket 10s (más tolerante)
    )

    cap = cv2.VideoCapture(camera_url, cv2.CAP_FFMPEG)

    if not cap.isOpened():
        log("❌ No se pudo abrir stream RTSP")
        sys.exit(1)

    # Configurar para mínima memoria
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)      # Buffer mínimo absoluto
    cap.set(cv2.CAP_PROP_FPS, 10)            # FPS bajo (10 FPS = menos RAM)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)

    log(f"✅ Stream RTSP conectado ({FRAME_WIDTH}x{FRAME_HEIGHT}, SKIP_FRAMES={SKIP_FRAMES})")

    # Estado de detección
    fall_counter = 0
    alert_active = False
    alert_start_time = 0  # Momento en que empezó la alerta actual
    last_alert_time = 0
    frame_count = 0

    # Buffers de suavizado con running sums (OPTIMIZADO)
    tilt_hist = deque(maxlen=SMOOTH_WINDOW)
    hip_hist = deque(maxlen=SMOOTH_WINDOW)
    ar_hist = deque(maxlen=SMOOTH_WINDOW)

    # Running sums para evitar recalcular sum() cada frame
    tilt_sum = 0.0
    hip_sum = 0.0
    ar_sum = 0.0

    log("🎬 Iniciando procesamiento de video...")

    # Variables para FPS
    fps_start_time = time.time()
    fps_frame_count = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                log("⚠️  Error al leer frame, reconectando...")
                cap.release()
                time.sleep(2)
                cap = cv2.VideoCapture(camera_url, cv2.CAP_FFMPEG)
                continue

            frame_count += 1

            # Skip frames para optimizar (opcional)
            if SKIP_FRAMES > 0 and frame_count % (SKIP_FRAMES + 1) != 0:
                continue

            # Procesar con MediaPipe
            H, W = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            try:
                results = pose.process(rgb)
            except Exception as e:
                log(f"⚠️  Error en MediaPipe: {e}")
                results = None

            # Extraer métricas
            mid_shoulder, mid_hip, torso_angle, hip_y_ratio, bbox = extract_pose_metrics(frame, results)

            # Detectar señales de caída (OPTIMIZADO con running sums)
            pose_signals = []

            if torso_angle is not None:
                # Si el deque está lleno, restar el valor que se va a eliminar
                if len(tilt_hist) >= SMOOTH_WINDOW:
                    tilt_sum -= tilt_hist[0]
                tilt_hist.append(torso_angle)
                tilt_sum += torso_angle
                tilt_smooth = tilt_sum / len(tilt_hist)
                if tilt_smooth > TORSO_TILT_DEG:
                    pose_signals.append("tilt")

            if hip_y_ratio is not None:
                if len(hip_hist) >= SMOOTH_WINDOW:
                    hip_sum -= hip_hist[0]
                hip_hist.append(hip_y_ratio)
                hip_sum += hip_y_ratio
                hip_smooth = hip_sum / len(hip_hist)
                if hip_smooth > HIP_Y_RATIO:
                    pose_signals.append("hip")

            if bbox is not None:
                x1, y1, x2, y2 = bbox
                w = x2 - x1
                h = y2 - y1
                if h > 0:
                    ar = w / float(h)
                    if len(ar_hist) >= SMOOTH_WINDOW:
                        ar_sum -= ar_hist[0]
                    ar_hist.append(ar)
                    ar_sum += ar
                    ar_smooth = ar_sum / len(ar_hist)
                    if ar_smooth > ASPECT_THRESHOLD:
                        pose_signals.append("aspect")

            # ¿Señal de caída?
            frame_has_fall_signal = len(pose_signals) >= 2  # Al menos 2 señales

            # Histeresis (reset rápido)
            prev_alert = alert_active
            if frame_has_fall_signal:
                fall_counter += 1
            else:
                fall_counter -= 2  # Resetea 2x más rápido cuando no hay señal
            fall_counter = max(0, min(fall_counter, FRAMES_CONFIRM * 2))  # Limitar máximo
            alert_active = fall_counter >= FRAMES_CONFIRM

            # Timeout automático: si está en alerta por más de ALERT_TIMEOUT_SEC, forzar reset
            if alert_active and alert_start_time > 0:
                time_in_alert = time.time() - alert_start_time
                if time_in_alert > ALERT_TIMEOUT_SEC:
                    log(f"⏰ Timeout de alerta alcanzado ({time_in_alert:.1f}s), reseteando estado")
                    fall_counter = 0
                    alert_active = False
                    alert_start_time = 0
                    prev_alert = False  # Asegurar transición limpia

            # Caída confirmada (transición a alerta)
            if alert_active and not prev_alert:
                # Si estamos en alerta pero sin timestamp, establecerlo
                if alert_start_time == 0:
                    alert_start_time = time.time()

                current_time = time.time()

                # Verificar cooldown
                if current_time - last_alert_time < ALERT_COOLDOWN_SEC:
                    log(f"⏸️  Caída detectada pero en cooldown ({int(current_time - last_alert_time)}s)")
                    continue

                alert_start_time = time.time()  # Marcar inicio de esta alerta
                log(f"🚨 ¡CAÍDA DETECTADA! Señales: {pose_signals}")

                # Verificar si hay cooldown extendido (cuidador confirmó "Ya voy")
                if dispositivo_id and adulto_mayor_id and check_cooldown_extendido(dispositivo_id, adulto_mayor_id):
                    log("⏭️  Caída detectada pero cooldown extendido activo - no se crea alerta")
                    # No crear alerta pero actualizar last_alert_time para respetar cooldown normal
                    last_alert_time = current_time
                    continue

                # Guardar snapshot y notificar en background (NO BLOQUEA)
                frame_copy = frame.copy()  # Copiar frame para thread seguro
                save_snapshot_async(frame_copy, dispositivo_id, adulto_mayor_id)
                last_alert_time = current_time
                log("✅ Alerta enviada a procesamiento asíncrono")

            # Si no hay alerta, resetear timestamp
            if not alert_active:
                alert_start_time = 0

            # Calcular FPS real
            fps_frame_count += 1
            if fps_frame_count >= 100:
                elapsed = time.time() - fps_start_time
                current_fps = fps_frame_count / elapsed
                log(f"📊 FPS: {current_fps:.1f} | Frames: {frame_count} | Estado: {'🚨 ALERTA' if alert_active else '✅ Normal'}")
                fps_start_time = time.time()
                fps_frame_count = 0

            # Limpieza de memoria cada 1000 frames (reducido para mejor rendimiento)
            if frame_count % 1000 == 0:
                gc.collect()  # Forzar recolección de basura
                log(f"🧹 Limpieza de memoria ejecutada (frame {frame_count})")

    except KeyboardInterrupt:
        log("👋 Deteniendo por interrupción de usuario...")
    except Exception as e:
        log(f"❌ Error fatal: {e}")
    finally:
        cap.release()
        pose.close()
        log("🛑 Recursos liberados")

if __name__ == "__main__":
    main()