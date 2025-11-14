#!/bin/bash
# Script para desplegar código actualizado al NanoPi

NANOPI_IP="192.168.70.69"
NANOPI_USER="judex"
NANOPI_PASS="0410"
LOCAL_FILE="/c/Users/acuri/Documents/Vigilia/Capstone/servicios/nanopi/fall_detection_edge.py"

echo "🚀 Desplegando código al NanoPi..."

# Copiar archivo usando SCP (requiere sshpass)
sshpass -p "$NANOPI_PASS" scp -o StrictHostKeyChecking=no "$LOCAL_FILE" "$NANOPI_USER@$NANOPI_IP:/tmp/fall_detection_edge.py"

if [ $? -ne 0 ]; then
    echo "❌ Error al copiar archivo. Verifica que sshpass esté instalado."
    exit 1
fi

echo "✅ Archivo copiado al NanoPi"

# Ejecutar comandos en el NanoPi para mover y reiniciar servicio
echo "📝 Moviendo archivo y reiniciando servicio..."
sshpass -p "$NANOPI_PASS" ssh -o StrictHostKeyChecking=no "$NANOPI_USER@$NANOPI_IP" << 'ENDSSH'
# Mover archivo a ubicación final
echo "0410" | sudo -S mv /tmp/fall_detection_edge.py /opt/vigilia-edge/fall_detection_edge.py
echo "0410" | sudo -S chmod +x /opt/vigilia-edge/fall_detection_edge.py

# Reiniciar servicio
echo "0410" | sudo -S systemctl restart vigilia-edge

# Verificar estado
echo "0410" | sudo -S systemctl status vigilia-edge --no-pager

echo "✅ Servicio reiniciado"
ENDSSH

echo "✅ Despliegue completado. Verificando logs..."
sshpass -p "$NANOPI_PASS" ssh -o StrictHostKeyChecking=no "$NANOPI_USER@$NANOPI_IP" "echo '0410' | sudo -S journalctl -u vigilia-edge -n 20 --no-pager"
