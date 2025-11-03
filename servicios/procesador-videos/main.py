
import os
import cv2
import math
import requests
from fastapi import FastAPI, HTTPException, Body
from pydantic import BaseModel
from google.cloud import storage
from ultralytics import YOLO
from datetime import datetime, timezone

# --- CONFIGURACIÓN ---
PROJECT_ID = os.environ.get("GCP_PROJECT", "composed-apogee-475623-p6")
BACKEND_API_URL = os.environ.get("BACKEND_API_URL", "https://api-backend-wsqxyy54za-uc.a.run.app")
INTERNAL_API_KEY = os.environ.get("internal-api-key", "CAMBIA_ESTA_CLAVE_SECRETA_POR_DEFECTO_TEST2")

app = FastAPI(title="Procesador de Video - VigilIA")

# --- MODELOS DE DATOS (Pydantic) ---
class PubSubMessage(BaseModel):
    data: str
    attributes: dict

class PubSubRequest(BaseModel):
    message: PubSubMessage

# --- LÓGICA DE PROCESAMIENTO DE VIDEO ---

print("Cargando modelo YOLOv8s...")
model = YOLO('yolov8s.pt')
print("✅ Modelo cargado.")

classnames = []
try:
    with open('classes.txt', 'r') as f:
        classnames = f.read().splitlines()
    print("✅ Archivo de clases cargado.")
except FileNotFoundError:
    print("❌ Advertencia: No se encontró 'classes.txt'. La detección de 'person' podría fallar.")
    classnames = ['person']

def download_video_from_gcs(bucket_name: str, file_name: str) -> str:
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(file_name)
    local_video_path = f"/tmp/{file_name.replace('/', '_')}"
    print(f"Descargando video gs://{bucket_name}/{file_name} a {local_video_path}...")
    blob.download_to_filename(local_video_path)
    print("✅ Video descargado.")
    return local_video_path

def process_video_for_fall_detection(video_path: str) -> bool:
    cap = cv2.VideoCapture(video_path)
    fall_detected = False
    print(f"Iniciando procesamiento de video: {video_path}")
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        results = model(frame, verbose=False)
        for info in results:
            for box in info.boxes:
                class_id = int(box.cls[0])
                if classnames[class_id].lower() == 'person' and box.conf[0] > 0.80:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    height = y2 - y1
                    width = x2 - x1
                    if width > height:
                        print(f"🚨 ¡Posible caída detectada! Ancho: {width}, Alto: {height}")
                        fall_detected = True
                        break
            if fall_detected:
                break
        if fall_detected:
            break
    cap.release()
    print(f"Resultado del análisis: {'Caída detectada' if fall_detected else 'No se detectó caída'}")
    return fall_detected

# --- NUEVA FUNCIÓN ---
def get_or_create_device_id(hardware_id: str) -> int:
    """
    Llama al backend para obtener o crear un ID numérico para un dispositivo
    basado en su ID de hardware (MAC address).
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
        if device_id is None:
            raise HTTPException(status_code=500, detail="El backend no devolvió un ID de dispositivo.")
        print(f"✅ Backend devolvió el ID de dispositivo numérico: {device_id}")
        return device_id
    except requests.exceptions.RequestException as e:
        print(f"❌ Error al comunicarse con el backend para obtener el ID del dispositivo: {e}")
        raise HTTPException(status_code=502, detail=f"Error al comunicarse con el backend: {e}")

def notify_backend(dispositivo_id: int, url_video: str):
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
    
    print(f"Enviando notificación de caída al backend para el dispositivo ID: {dispositivo_id}")
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
    return {"status": "Procesador de Video está en línea"}

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

    # --- LÓGICA DE EXTRACCIÓN DE ID MODIFICADA ---
    try:
        # El ID de hardware es la primera parte de la ruta del archivo
        hardware_id = file_name.split('/')[0]
        if not hardware_id:
            raise ValueError("ID de hardware vacío en la ruta del archivo.")
    except (IndexError, ValueError) as e:
        print(f"❌ No se pudo extraer el ID de hardware de la ruta: {file_name}. Error: {e}")
        return # Terminar exitosamente para que Pub/Sub no reintente

    # 1. Obtener el ID numérico del dispositivo desde el backend
    try:
        dispositivo_id_numerico = get_or_create_device_id(hardware_id)
    except HTTPException as e:
        # Si no se puede contactar al backend, no podemos continuar.
        # El error ya se ha logueado. Devolvemos 500 para que Pub/Sub pueda reintentar.
        raise HTTPException(status_code=500, detail=f"Fallo al obtener ID del backend: {e.detail}")

    # 2. Descargar el video
    local_video_path = download_video_from_gcs(bucket_name, file_name)
    
    # 3. Procesar el video
    fall_detected = process_video_for_fall_detection(local_video_path)
    
    # 4. Si se detecta una caída, notificar al backend
    if fall_detected:
        url_video_almacenado = f"gs://{bucket_name}/{file_name}"
        notify_backend(dispositivo_id_numerico, url_video_almacenado)
        
    # 5. Limpiar el archivo local
    try:
        os.remove(local_video_path)
        print(f"🗑️ Archivo temporal eliminado: {local_video_path}")
    except OSError as e:
        print(f"❌ Error al eliminar el archivo temporal: {e}")

    return
