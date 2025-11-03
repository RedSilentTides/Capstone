# Usar una imagen base de Python con soporte para OpenCV
FROM python:3.11-slim

# Instalar dependencias del sistema necesarias para OpenCV y librerías multimedia
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de requirements
COPY requirements.txt .

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código de la aplicación y archivos necesarios
COPY main.py .
COPY classes.txt .
COPY yolov8s.pt .

# Pre-compilar el código Python
RUN python -m compileall .

# Exponer el puerto que usa Cloud Run
EXPOSE 8080

# Configurar variables de entorno por defecto
ENV PORT=8080

# Comando para ejecutar la aplicación
# Cloud Run inyecta la variable $PORT automáticamente
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT}
