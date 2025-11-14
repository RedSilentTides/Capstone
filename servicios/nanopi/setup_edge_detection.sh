#!/bin/bash
#
# Setup script para Fall Detection Edge Service en NanoPi Neo4
# Instalación de MediaPipe y dependencias en ARM64/Armbian
#

set -e

echo "=========================================="
echo "🚀 Setup Fall Detection Edge - NanoPi Neo4"
echo "=========================================="

# Verificar que estamos en ARM64
ARCH=$(uname -m)
if [ "$ARCH" != "aarch64" ] && [ "$ARCH" != "arm64" ]; then
    echo "⚠️  Advertencia: Arquitectura $ARCH no es ARM64"
    read -p "¿Continuar de todas formas? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Actualizar sistema
echo "📦 Actualizando sistema..."
sudo apt-get update

# Instalar dependencias del sistema para OpenCV y MediaPipe
echo "📦 Instalando dependencias del sistema..."
sudo apt-get install -y \
    python3-pip \
    python3-dev \
    python3-venv \
    libopencv-dev \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    libgstreamer1.0-0 \
    libgstreamer-plugins-base1.0-0 \
    ffmpeg \
    build-essential

# Crear directorio de trabajo
echo "📁 Creando directorio de trabajo..."
sudo mkdir -p /opt/vigilia-edge
sudo chown -R $USER:$USER /opt/vigilia-edge
cd /opt/vigilia-edge

# Crear entorno virtual Python
echo "🐍 Creando entorno virtual Python..."
python3 -m venv venv
source venv/bin/activate

# Actualizar pip
echo "⬆️  Actualizando pip..."
pip install --upgrade pip setuptools wheel

# Instalar dependencias Python
echo "📦 Instalando dependencias Python (esto puede tardar varios minutos)..."
pip install \
    opencv-python \
    mediapipe \
    google-cloud-storage \
    requests

# Copiar script principal
echo "📄 Copiando fall_detection_edge.py..."
if [ -f "/home/$USER/fall_detection_edge.py" ]; then
    cp /home/$USER/fall_detection_edge.py /opt/vigilia-edge/
else
    echo "⚠️  No se encontró fall_detection_edge.py en /home/$USER/"
    echo "   Por favor, copia el archivo manualmente a /opt/vigilia-edge/"
fi

# Crear directorio para credenciales de GCP
echo "🔑 Configurando credenciales de GCP..."
sudo mkdir -p /opt/vigilia-edge/credentials

echo ""
echo "=========================================="
echo "✅ Instalación completada"
echo "=========================================="
echo ""
echo "📝 PASOS SIGUIENTES:"
echo ""
echo "1. Copiar credenciales de GCP:"
echo "   scp tu-service-account.json nanopi:/opt/vigilia-edge/credentials/gcp-key.json"
echo ""
echo "2. Verificar /etc/camera_ip.env existe con la IP de tu cámara:"
echo "   echo 'CAMERA_IP=192.168.1.X' | sudo tee /etc/camera_ip.env"
echo ""
echo "3. Configurar variables de entorno en /etc/vigilia-edge.env:"
echo "   sudo nano /etc/vigilia-edge.env"
echo ""
echo "4. Instalar el servicio systemd:"
echo "   sudo cp vigilia-fall-detection.service /etc/systemd/system/"
echo "   sudo systemctl daemon-reload"
echo "   sudo systemctl enable vigilia-fall-detection"
echo "   sudo systemctl start vigilia-fall-detection"
echo ""
echo "5. Verificar logs:"
echo "   sudo journalctl -u vigilia-fall-detection -f"
echo ""
