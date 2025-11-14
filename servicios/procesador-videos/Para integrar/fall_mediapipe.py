
import cv2
import math
import os
import time
from collections import deque
from datetime import datetime
import mediapipe as mp

# ===========================
# PARÁMETROS
# ===========================
ASPECT_THRESHOLD   = 1.6    # (opcional) ancho/alto bbox landmarks > 1.6 → acostado
TORSO_TILT_DEG     = 55     # inclinación torso (0° vertical, 90° horizontal)
HIP_Y_RATIO        = 0.75   # cadera por debajo del 75% de la altura de la imagen
FRAMES_CONFIRM     = 12     # frames consecutivos para confirmar la alerta
DRAW_SKELETON      = True   # dibujar esqueleto
SMOOTH_WINDOW      = 5      # suavizado de señales (media móvil)

# Guardado de imágenes
SAVE_DIR            = "fall_snaps"
SAVE_FULL_FRAME     = True   # True: frame completo; False: recorte (bbox landmarks)
SNAP_DELAY_SEC      = 1.0    # *** Toma la foto 1 segundo después de confirmar la caída ***

os.makedirs(SAVE_DIR, exist_ok=True)

# ===========================
# MEDIAPIPE
# ===========================
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

# ===========================
# UTILIDADES
# ===========================
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
            xs.append(x); ys.append(y)

    bbox = None
    if xs and ys:
        pad = 20
        x1, y1 = max(0, min(xs) - pad), max(0, min(ys) - pad)
        x2, y2 = min(W - 1, max(xs) + pad), min(H - 1, max(ys) + pad)
        if x2 > x1 and y2 > y1:
            bbox = (x1, y1, x2, y2)

    return mid_shoulder, mid_hip, torso_angle, hip_y_ratio, bbox

def draw_pose_on_frame(frame, results):
    if not DRAW_SKELETON or not results or not results.pose_landmarks:
        return
    mp_drawing.draw_landmarks(
        frame,
        results.pose_landmarks,
        mp_pose.POSE_CONNECTIONS
    )

def save_snapshot(frame, bbox, save_full):
    H, W = frame.shape[:2]
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    if save_full or bbox is None:
        snap = frame.copy()
        fname = os.path.join(SAVE_DIR, f"fall_full_{ts}.jpg")
    else:
        x1, y1, x2, y2 = bbox
        snap = frame[max(0, y1):min(H, y2), max(0, x1):min(W, x2)].copy()
        fname = os.path.join(SAVE_DIR, f"fall_crop_{ts}.jpg")
    cv2.imwrite(fname, snap)
    return fname

# ===========================
# CÁMARA
# ===========================
camera_indexes = [0, 1, 2]
cap = None
for idx in camera_indexes:
    print(f"Intentando abrir cámara con índice {idx}...")
    cap = cv2.VideoCapture(idx)
    if cap is not None and cap.isOpened():
        print(f"✅ Cámara abierta con índice {idx}")
        break
if cap is None or not cap.isOpened():
    print("❌ No se pudo abrir ninguna cámara")
    raise SystemExit

print("✅ Cámara iniciada. Presiona 'q' para salir.")

# ===========================
# LOOP
# ===========================
fall_counter = 0
alert_active = False

# Estado del evento de caída (para disparar foto con retardo)
event_active = False         # estamos en un evento de caída confirmado
event_started_at = 0.0       # instante en que se confirmó la caída
event_snapshot_done = False  # ya se tomó la foto de este evento

# buffers para suavizar
tilt_hist = deque(maxlen=SMOOTH_WINDOW)
hip_hist  = deque(maxlen=SMOOTH_WINDOW)
ar_hist   = deque(maxlen=SMOOTH_WINDOW)  # por si usamos aspecto de bbox (opcional)

while True:
    ret, frame = cap.read()
    if not ret:
        print("❌ Error: no se pudo acceder a la cámara.")
        break

    frame = cv2.flip(frame, 1)
    H, W = frame.shape[:2]

    # MediaPipe Pose
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    try:
        results = pose.process(rgb)
    except Exception:
        results = None

    # Métricas
    mid_shoulder, mid_hip, torso_angle, hip_y_ratio, bbox = extract_pose_metrics(frame, results)

    # Señales de caída usando SOLO MediaPipe
    pose_signals = []
    tilt_txt = "N/A"
    hip_txt  = "N/A"
    ar_txt   = "N/A"

    if torso_angle is not None:
        tilt_hist.append(torso_angle)
        tilt_smooth = sum(tilt_hist) / len(tilt_hist)
        tilt_txt = f"{tilt_smooth:.0f}°"
        if tilt_smooth > TORSO_TILT_DEG:
            pose_signals.append("tilt")

    if hip_y_ratio is not None:
        hip_hist.append(hip_y_ratio)
        hip_smooth = sum(hip_hist) / len(hip_hist)
        hip_txt = f"{hip_smooth:.2f}"
        if hip_smooth > HIP_Y_RATIO:
            pose_signals.append("hip")

    # (Opcional) usar relación de aspecto del bbox de landmarks
    if bbox is not None:
        x1, y1, x2, y2 = bbox
        w = x2 - x1
        h = y2 - y1
        if h > 0:
            ar = w / float(h)
            ar_hist.append(ar)
            ar_smooth = sum(ar_hist) / len(ar_hist)
            ar_txt = f"{ar_smooth:.1f}"
            if ar_smooth > ASPECT_THRESHOLD:
                pose_signals.append("aspect")

    # ¿Señal de caída en este frame?
    frame_has_fall_signal = len(pose_signals) >= 1

    # Histeresis temporal para confirmar caída
    prev_alert = alert_active
    fall_counter += 1 if frame_has_fall_signal else -1
    fall_counter = max(0, fall_counter)
    alert_active = fall_counter >= FRAMES_CONFIRM

    # Transición: se acaba de confirmar la caída (inicia evento)
    if alert_active and not prev_alert:
        event_active = True
        event_started_at = time.time()
        event_snapshot_done = False

    # Transición: terminó la caída (reset evento)
    if not alert_active and prev_alert:
        event_active = False
        event_snapshot_done = False

    # Dibujos
    if results:
        draw_pose_on_frame(frame, results)

    if bbox is not None:
        color = (0, 0, 255) if alert_active else (0, 255, 0)
        x1, y1, x2, y2 = bbox
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

    status_pose = "✓" if frame_has_fall_signal else "x"
    label1 = f"POSE[{status_pose}]"
    label2 = f"tilt={tilt_txt} hipY={hip_txt} AR={ar_txt}"
    cv2.putText(frame, label1, (20, H - 50), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
    cv2.putText(frame, label2, (20, H - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)

    # Mensajes y cuenta regresiva para la foto diferida
    if alert_active:
        cv2.putText(frame, "⚠️ CAIDA DETECTADA (MediaPipe) ⚠️", (40, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 4)

        if event_active and not event_snapshot_done:
            elapsed = time.time() - event_started_at
            remaining = max(0.0, SNAP_DELAY_SEC - elapsed)
            cv2.putText(frame, f"Tomando foto en {remaining:.1f}s",
                        (40, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

            # ¿Ya pasó 1s desde la confirmación? → Guardar snapshot ahora
            if elapsed >= SNAP_DELAY_SEC:
                try:
                    fname = save_snapshot(frame, bbox, SAVE_FULL_FRAME)
                    event_snapshot_done = True
                    cv2.putText(frame, f"Imagen guardada: {os.path.basename(fname)}",
                                (40, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
                    print(f"💾 Guardada: {fname}")
                except Exception as e:
                    cv2.putText(frame, f"Error guardando: {e}",
                                (40, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

    cv2.imshow("Fall Detection Live - Solo MediaPipe (1s delay)", frame)

    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'):
        print("👋 Cerrando cámara...")
        break

cap.release()
pose.close()
cv2.destroyAllWindows()
