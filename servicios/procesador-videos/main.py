
import os
import cv2
import math
import requests
from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from google.cloud import storage
from datetime import datetime, timezone
from collections import deque
import mediapipe as mp

# --- CONFIGURACIÓN ---
PROJECT_ID = os.environ.get("GCP_PROJECT", "composed-apogee-475623-p6")
BACKEND_API_URL = os.environ.get("BACKEND_API_URL", "https://api-backend-687053793381.southamerica-west1.run.app")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY") or os.environ.get("internal-api-key") or os.environ.get("internal_api_key") or "CAMBIA_ESTA_CLAVE_SECRETA_POR_DEFECTO_TEST2"

# Parámetros de detección de caídas
TORSO_TILT_DEG = 55      # inclinación torso (0° vertical, 90° horizontal)
HIP_Y_RATIO = 0.75       # cadera por debajo del 75% de la altura de la imagen
ASPECT_THRESHOLD = 1.6   # ancho/alto bbox > 1.6 → acostado
FRAMES_CONFIRM = 8       # frames consecutivos para confirmar la alerta (reducido para videos cortos)
SMOOTH_WINDOW = 3        # suavizado de señales (media móvil)

print(f"🔍 PROCESADOR DEBUG: INTERNAL_API_KEY = '{INTERNAL_API_KEY}' (len: {len(INTERNAL_API_KEY)})")
print(f"🔍 PROCESADOR DEBUG: Todas las variables: {sorted(os.environ.keys())}")

app = FastAPI(title="Procesador de Video - VigilIA (MediaPipe)")

# --- MODELOS DE DATOS (Pydantic) ---
class PubSubMessage(BaseModel):
    data: str
    attributes: dict

class PubSubRequest(BaseModel):
    message: PubSubMessage

# --- MEDIAPIPE SETUP ---
print("Inicializando MediaPipe Pose...")
mp_pose = mp.solutions.pose
mp_drawing = mp.solutions.drawing_utils

pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=1,
    smooth_landmarks=True,
    enable_segmentation=False,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)
print("✅ MediaPipe Pose inicializado.")

# --- UTILIDADES PARA DETECCIÓN DE CAÍDAS ---

def angle_from_vertical(p_top, p_bottom):
    """Ángulo (grados) del vector p_top->p_bottom respecto a la vertical. 0° = vertical, 90° = horizontal."""
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
    """
    Devuelve:
      - mid_shoulder, mid_hip (tuplas x,y o None)
      - torso_angle (float o None)
      - hip_y_ratio (float o None, relativo a alto del frame)
      - bbox_from_landmarks (x1,y1,x2,y2) o None
    """
    if not results or not results.pose_landmarks:
        return None, None, None, None, None

    H, W = frame.shape[:2]
    lms = results.pose_landmarks.landmark

    # IDs de hombros y caderas en MediaPipe
    LS, RS, LH, RH = 11, 12, 23, 24

    try:
        ls, v_ls = to_px(lms[LS], W, H)
        rs, v_rs = to_px(lms[RS], W, H)
        lh, v_lh = to_px(lms[LH], W, H)
        rh, v_rh = to_px(lms[RH], W, H)
    except Exception:
        return None, None, None, None, None

    VMIN = 0.4
    ls_xy = ls if v_ls >= VMIN else None
    rs_xy = rs if v_rs >= VMIN else None
    lh_xy = lh if v_lh >= VMIN else None
    rh_xy = rh if v_rh >= VMIN else None

    mid_shoulder = midpoint(ls_xy, rs_xy)
    mid_hip = midpoint(lh_xy, rh_xy)

    torso_angle = angle_from_vertical(mid_shoulder, mid_hip) if (mid_shoulder and mid_hip) else None
    hip_y_ratio = (mid_hip[1] / float(H)) if mid_hip else None

    # BBox aproximada a partir de landmarks visibles
    xs, ys = [], []
    for lm in lms:
        if lm.visibility >= 0.4:
            x, y = int(lm.x * W), int(lm.y * H)
            xs.append(x)
            ys.append(y)

    bbox = None
    if xs and ys:
        pad = 20
        x1, y1 = max(0, min(xs) - pad), max(0, min(ys) - pad)
        x2, y2 = min(W - 1, max(xs) + pad), min(H - 1, max(ys) + pad)
        if x2 > x1 and y2 > y1:
            bbox = (x1, y1, x2, y2)

    return mid_shoulder, mid_hip, torso_angle, hip_y_ratio, bbox

def save_snapshot_to_gcs(frame, bucket_name, hardware_id):
    """Guarda el snapshot del frame en GCS y retorna la URL."""
    try:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{hardware_id}/snapshots/fall_{ts}.jpg"

        # Guardar localmente primero
        local_path = f"/tmp/fall_{ts}.jpg"
        cv2.imwrite(local_path, frame)

        # Subir a GCS
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(filename)
        blob.upload_from_filename(local_path)

        # Limpiar archivo local
        os.remove(local_path)

        url = f"gs://{bucket_name}/{filename}"
        print(f"💾 Snapshot guardado en: {url}")
        return url
    except Exception as e:
        print(f"❌ Error al guardar snapshot: {e}")
        return None

# --- LÓGICA DE PROCESAMIENTO DE VIDEO ---

def download_video_from_gcs(bucket_name: str, file_name: str) -> str:
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(file_name)
    local_video_path = f"/tmp/{file_name.replace('/', '_')}"
    print(f"Descargando video gs://{bucket_name}/{file_name} a {local_video_path}...")
    blob.download_to_filename(local_video_path)
    print("✅ Video descargado.")
    return local_video_path

def process_video_for_fall_detection(video_path: str, bucket_name: str, hardware_id: str) -> tuple[bool, str | None]:
    """
    Procesa el video usando MediaPipe para detectar caídas.
    Retorna (fall_detected: bool, snapshot_url: str | None)
    """
    cap = cv2.VideoCapture(video_path)
    fall_detected = False
    snapshot_url = None

    fall_counter = 0
    alert_active = False
    snapshot_taken = False

    # Buffers para suavizar
    tilt_hist = deque(maxlen=SMOOTH_WINDOW)
    hip_hist = deque(maxlen=SMOOTH_WINDOW)
    ar_hist = deque(maxlen=SMOOTH_WINDOW)

    print(f"Iniciando procesamiento de video con MediaPipe: {video_path}")
    frame_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1
        H, W = frame.shape[:2]

        # MediaPipe Pose
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        try:
            results = pose.process(rgb)
        except Exception:
            results = None

        # Métricas
        mid_shoulder, mid_hip, torso_angle, hip_y_ratio, bbox = extract_pose_metrics(frame, results)

        # Señales de caída
        pose_signals = []

        if torso_angle is not None:
            tilt_hist.append(torso_angle)
            tilt_smooth = sum(tilt_hist) / len(tilt_hist)
            if tilt_smooth > TORSO_TILT_DEG:
                pose_signals.append("tilt")

        if hip_y_ratio is not None:
            hip_hist.append(hip_y_ratio)
            hip_smooth = sum(hip_hist) / len(hip_hist)
            if hip_smooth > HIP_Y_RATIO:
                pose_signals.append("hip")

        # Aspect ratio del bbox
        if bbox is not None:
            x1, y1, x2, y2 = bbox
            w = x2 - x1
            h = y2 - y1
            if h > 0:
                ar = w / float(h)
                ar_hist.append(ar)
                ar_smooth = sum(ar_hist) / len(ar_hist)
                if ar_smooth > ASPECT_THRESHOLD:
                    pose_signals.append("aspect")

        # ¿Señal de caída en este frame?
        frame_has_fall_signal = len(pose_signals) >= 2  # Al menos 2 señales

        # Histeresis temporal
        prev_alert = alert_active
        fall_counter += 1 if frame_has_fall_signal else -1
        fall_counter = max(0, fall_counter)
        alert_active = fall_counter >= FRAMES_CONFIRM

        # Si se confirma la caída y no hemos tomado snapshot
        if alert_active and not prev_alert:
            fall_detected = True
            print(f"🚨 ¡Caída detectada en frame {frame_count}! Señales: {pose_signals}")

        # Tomar snapshot cuando se confirma la caída
        if alert_active and not snapshot_taken:
            snapshot_url = save_snapshot_to_gcs(frame, bucket_name, hardware_id)
            snapshot_taken = True

        # Si ya detectamos caída y tomamos snapshot, podemos salir
        if fall_detected and snapshot_taken:
            break

    cap.release()
    print(f"Resultado del análisis: {'Caída detectada' if fall_detected else 'No se detectó caída'} (procesados {frame_count} frames)")
    return fall_detected, snapshot_url

# --- FUNCIONES DE BACKEND ---

def get_or_create_device_id(hardware_id: str) -> dict:
    """
    Llama al backend para obtener o crear un ID numérico para un dispositivo
    basado en su ID de hardware (MAC address).
    Retorna un dict con 'id' y 'adulto_mayor_id' (puede ser None).
    """
    endpoint = f"{BACKEND_API_URL}/dispositivos/get-or-create"
    headers = {
        "X-Internal-Token": INTERNAL_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {"hardware_id": hardware_id}

    print(f"Consultando al backend por el ID de hardware: {hardware_id}")
    try:
        response = requests.post(endpoint, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
        response_data = response.json()
        device_id = response_data.get("id")
        adulto_mayor_id = response_data.get("adulto_mayor_id")

        if device_id is None:
            raise HTTPException(status_code=500, detail="El backend no devolvió un ID de dispositivo.")

        print(f"✅ Backend devolvió el ID de dispositivo numérico: {device_id}, Adulto Mayor ID: {adulto_mayor_id}")
        return {"id": device_id, "adulto_mayor_id": adulto_mayor_id}
    except requests.exceptions.RequestException as e:
        print(f"❌ Error al comunicarse con el backend para obtener el ID del dispositivo: {e}")
        raise HTTPException(status_code=502, detail=f"Error al comunicarse con el backend: {e}")

def notify_backend(dispositivo_id: int, adulto_mayor_id: int | None, url_video: str, snapshot_url: str | None):
    """Notifica al backend API sobre el evento de caída."""
    endpoint = f"{BACKEND_API_URL}/eventos-caida/notificar"
    headers = {
        "X-Internal-Token": INTERNAL_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "dispositivo_id": dispositivo_id,
        "timestamp_caida": datetime.now(timezone.utc).isoformat(),
        "url_video_almacenado": url_video
    }

    # Agregar snapshot URL si está disponible
    if snapshot_url:
        payload["snapshot_url"] = snapshot_url

    # Si tenemos el adulto_mayor_id, también lo enviamos
    if adulto_mayor_id:
        payload["adulto_mayor_id"] = adulto_mayor_id
        print(f"Enviando notificación de caída al backend para el dispositivo ID: {dispositivo_id}, Adulto Mayor ID: {adulto_mayor_id}")
    else:
        print(f"Enviando notificación de caída al backend para el dispositivo ID: {dispositivo_id} (sin adulto mayor asociado)")

    try:
        response = requests.post(endpoint, json=payload, headers=headers, timeout=10)
        response.raise_for_status()
        print(f"✅ Notificación de caída enviada exitosamente. Respuesta: {response.json()}")
    except requests.exceptions.RequestException as e:
        print(f"❌ Error al notificar caída al backend: {e}")
        raise HTTPException(status_code=502, detail=f"Error al comunicarse con el backend: {e}")

# --- ENDPOINTS DE LA API ---

@app.get("/")
def read_root():
    return {"status": "Procesador de Video (MediaPipe) está en línea", "version": "2.0-mediapipe"}

@app.post("/", status_code=204)
async def process_video_event(request: PubSubRequest = Body(...)):
    import base64
    import json

    try:
        message_data = base64.b64decode(request.message.data).decode('utf-8')
        event_data = json.loads(message_data)
        bucket_name = event_data['bucket']
        file_name = event_data['name']
    except Exception as e:
        print(f"❌ Error al decodificar el mensaje de Pub/Sub: {e}")
        raise HTTPException(status_code=400, detail="Mensaje de Pub/Sub inválido.")

    print(f"📬 Evento recibido para el archivo: gs://{bucket_name}/{file_name}")

    # Extraer ID de hardware
    try:
        hardware_id = file_name.split('/')[0]
        if not hardware_id:
            raise ValueError("ID de hardware vacío en la ruta del archivo.")
    except (IndexError, ValueError) as e:
        print(f"❌ No se pudo extraer el ID de hardware de la ruta: {file_name}. Error: {e}")
        return

    # 1. Obtener el ID numérico del dispositivo y el adulto_mayor_id desde el backend
    try:
        device_info = get_or_create_device_id(hardware_id)
        dispositivo_id_numerico = device_info["id"]
        adulto_mayor_id = device_info.get("adulto_mayor_id")
    except HTTPException as e:
        raise HTTPException(status_code=500, detail=f"Fallo al obtener ID del backend: {e.detail}")

    # 2. Descargar el video
    local_video_path = download_video_from_gcs(bucket_name, file_name)

    # 3. Procesar el video con MediaPipe
    fall_detected, snapshot_url = process_video_for_fall_detection(local_video_path, bucket_name, hardware_id)

    # 4. Si se detecta una caída, notificar al backend
    if fall_detected:
        url_video_almacenado = f"gs://{bucket_name}/{file_name}"
        notify_backend(dispositivo_id_numerico, adulto_mayor_id, url_video_almacenado, snapshot_url)

    # 5. Limpiar el archivo local
    try:
        os.remove(local_video_path)
        print(f"🗑️ Archivo temporal eliminado: {local_video_path}")
    except OSError as e:
        print(f"❌ Error al eliminar el archivo temporal: {e}")

    return
