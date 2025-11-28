# Usa una imagen base de Python oficial
FROM python:3.11-slim

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia el archivo de requerimientos y los instala
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia el resto de tu código
COPY . .

# Expone el puerto en el que la aplicación se ejecutará
EXPOSE 8080

# Define el comando para iniciar la aplicación
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
