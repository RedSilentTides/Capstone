from fastapi import FastAPI
from pydantic import BaseModel
from google.cloud import pubsub_v1
import os

# --- CONFIGURACIÓN ---
# El ID de tu proyecto de GCP.
PROJECT_ID = "composed-apogee-475623-p6" # <-- ¡Asegúrate de que este sea tu ID de proyecto!
# El ID del tema de Pub/Sub que creaste.
TOPIC_ID = "caidas-detectadas"

# Inicializa la aplicación FastAPI
app = FastAPI()

# Inicializa el cliente para publicar en Pub/Sub
publisher = pubsub_v1.PublisherClient()
topic_path = publisher.topic_path(PROJECT_ID, TOPIC_ID)

# Define la estructura de los datos que esperamos recibir
class VideoEvent(BaseModel):
    bucket: str
    file: str

@app.post("/process")
async def process_video(event: VideoEvent):
    """
    Este endpoint recibe un evento, simula un análisis y, si es positivo,
    publica un mensaje en Pub/Sub.
    """
    print(f"✅ Evento recibido para el archivo: gs://{event.bucket}/{event.file}")

    final_decision = "No se detectó caída"
    fall_detected = False

    # Lógica de simulación: si el archivo es un .txt, damos positivo.
    if event.file.endswith(".txt"):
        fall_detected = True
        final_decision = "Caída detectada"
        print("🤖 Simulación: Ambas validaciones son POSITIVAS.")
    
    # Si se detectó una caída, publica un mensaje en Pub/Sub
    if fall_detected:
        try:
            # El mensaje se envía como bytes. Incluimos el nombre del archivo.
            message_data = event.file.encode("utf-8")
            
            # Publicamos el mensaje en el tema.
            future = publisher.publish(topic_path, message_data)
            message_id = future.result() # Esperamos a que se publique
            
            print(f"📢 Mensaje de caída publicado en Pub/Sub con ID: {message_id}")

        except Exception as e:
            print(f"❌ Error al publicar en Pub/Sub: {e}")
            # Aquí podrías manejar el error, por ahora solo lo imprimimos

    print(f"🧠 Resultado del análisis: {final_decision}")
    return {"status": "procesado", "decision": final_decision}