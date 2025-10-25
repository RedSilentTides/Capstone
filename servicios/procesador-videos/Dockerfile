# 1. Usa una imagen base de Python oficial
FROM python:3.11-slim

# 2. Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# 3. Copia el archivo de requerimientos y los instala
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Copia el resto de tu código
COPY . .

# 5. Expone el puerto en el que la aplicación se ejecutará
EXPOSE 8080

# 6. Define el comando para iniciar la aplicación cuando el contenedor se inicie
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]