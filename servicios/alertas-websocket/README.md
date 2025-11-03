# Servicio de WebSocket para Alertas en Tiempo Real - VigilIA

Este servicio maneja las conexiones WebSocket para notificaciones de alertas en tiempo real entre adultos mayores y cuidadores.

## Arquitectura

```
┌─────────────────┐         ┌──────────────────┐         ┌────────────────┐
│  Adulto Mayor   │         │   API Backend    │         │   Cuidadores   │
│   (Frontend)    │────────▶│   (FastAPI)      │         │   (Frontend)   │
└─────────────────┘         └──────────────────┘         └────────────────┘
                                     │                            │
                                     │ HTTP POST                  │ WebSocket
                                     │ /internal/notify-alert     │ Connection
                                     ▼                            ▼
                            ┌────────────────────────────────────────┐
                            │   WebSocket Service                    │
                            │   (Este servicio)                      │
                            │   - Gestiona conexiones persistentes   │
                            │   - Enruta notificaciones              │
                            │   - Mantiene estado de conexiones      │
                            └────────────────────────────────────────┘
                                           │
                                           ▼
                                  ┌────────────────┐
                                  │  Cloud SQL     │
                                  │  PostgreSQL    │
                                  └────────────────┘
```

## Características

- ✅ Conexiones WebSocket persistentes y autenticadas con Firebase
- ✅ Gestión automática de reconexión
- ✅ Notificaciones en tiempo real sin polling
- ✅ Soporte para múltiples conexiones por usuario
- ✅ Health checks y estadísticas
- ✅ Integración con Cloud SQL para autenticación de usuarios
- ✅ Comunicación interna segura entre servicios

## Endpoints

### WebSocket

#### `ws://[URL]/ws/alertas?token=<firebase_id_token>`

Conexión WebSocket para recibir alertas en tiempo real.

**Query Parameters:**
- `token` (requerido): Firebase ID token del usuario autenticado

**Requisitos:**
- El usuario debe tener rol `cuidador`
- El token de Firebase debe ser válido

**Mensajes que recibe el cliente:**

1. **Conexión exitosa:**
```json
{
  "tipo": "conexion_exitosa",
  "mensaje": "Conectado al servicio de alertas en tiempo real",
  "timestamp": "2025-11-03T12:00:00",
  "usuario": "Nombre del Usuario"
}
```

2. **Nueva alerta:**
```json
{
  "tipo": "nueva_alerta",
  "alerta": {
    "id": 13,
    "adulto_mayor_id": 1,
    "tipo_alerta": "ayuda",
    "timestamp_alerta": "2025-11-03T12:00:00",
    "nombre_adulto_mayor": "Alexander",
    ...
  },
  "timestamp": "2025-11-03T12:00:00"
}
```

3. **Pong (respuesta a ping):**
```json
{
  "tipo": "pong",
  "timestamp": "2025-11-03T12:00:00"
}
```

**Mensajes que envía el cliente:**

- `"ping"`: Para mantener la conexión viva (heartbeat)

### HTTP Endpoints

#### `POST /internal/notify-alert`

Endpoint interno para que el API Backend notifique nuevas alertas.

**Headers:**
- `X-Internal-Key`: Clave secreta para autenticación entre servicios

**Body:**
```json
{
  "id": 13,
  "adulto_mayor_id": 1,
  "tipo_alerta": "ayuda",
  "timestamp_alerta": "2025-11-03T12:00:00",
  "nombre_adulto_mayor": "Alexander",
  ...
}
```

**Response:**
```json
{
  "success": true,
  "message": "Notificación enviada a 2 cuidadores",
  "total_cuidadores": 3,
  "notified_count": 2,
  "connected_users": ["firebase_uid_1", "firebase_uid_2"]
}
```

#### `GET /health`

Health check del servicio.

**Response:**
```json
{
  "status": "healthy",
  "service": "alertas-websocket",
  "connected_users": 5,
  "timestamp": "2025-11-03T12:00:00"
}
```

#### `GET /stats`

Estadísticas del servicio.

**Response:**
```json
{
  "connected_users_count": 5,
  "connected_firebase_uids": ["uid1", "uid2", "uid3", "uid4", "uid5"],
  "timestamp": "2025-11-03T12:00:00"
}
```

## Despliegue en GCP Cloud Run

### Requisitos previos

1. Tener configurado Google Cloud SDK (`gcloud`)
2. Estar autenticado: `gcloud auth login`
3. Tener configurado el proyecto: `gcloud config set project composed-apogee-475623-p6`

### Desplegar el servicio

Desde la carpeta `servicios/alertas-websocket`, ejecuta:

```powershell
.\deploy-websocket.ps1
```

O manualmente:

```powershell
gcloud run deploy alertas-websocket `
  --source . `
  --region southamerica-west1 `
  --allow-unauthenticated `
  --min-instances 0 `
  --memory 512Mi `
  --add-cloudsql-instances "composed-apogee-475623-p6:southamerica-west1:vigilia-db-main" `
  --update-secrets=DB_PASS=vigilia-db-password:latest `
  --update-secrets=internal-api-key=internal-api-key:latest
```

### Configuración de secretos

El servicio necesita estos secretos en Google Secret Manager:

1. **vigilia-db-password**: Contraseña de la base de datos PostgreSQL
2. **internal-api-key**: Clave para autenticación entre servicios

Para crear/actualizar secretos:

```bash
# Crear secret
echo -n "tu-password" | gcloud secrets create vigilia-db-password --data-file=-

# Actualizar secret
echo -n "nuevo-password" | gcloud secrets versions add vigilia-db-password --data-file=-
```

## Variables de Entorno

El servicio lee estas variables de entorno:

- `DB_PASS`: Contraseña de PostgreSQL (inyectada desde Secret Manager)
- `DB_SOCKET_DIR`: Directorio del socket de Cloud SQL (default: `/cloudsql`)
- `INTERNAL_API_KEY`: Clave para autenticación entre servicios (inyectada desde Secret Manager)

## Desarrollo Local

### 1. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 2. Configurar variables de entorno

```bash
export DB_PASS="tu-password-local"
export INTERNAL_API_KEY="clave-local"
```

### 3. Ejecutar el servicio

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8080
```

### 4. Probar la conexión WebSocket

Puedes usar herramientas como:
- [Postman](https://www.postman.com/) (soporta WebSocket)
- [WebSocket King](https://websocketking.com/)
- El cliente de frontend

URL de prueba:
```
ws://localhost:8080/ws/alertas?token=<tu_firebase_token>
```

## Integración con el Frontend

Ver el archivo `frontend-vigilia/services/websocketService.ts` para la implementación del cliente WebSocket.

## Monitoreo

### Ver logs en GCP

```bash
gcloud run services logs read alertas-websocket --region southamerica-west1
```

### Ver logs en tiempo real

```bash
gcloud run services logs tail alertas-websocket --region southamerica-west1
```

## Troubleshooting

### Error: "Token de autorización no proporcionado"

- Asegúrate de que el token de Firebase esté en el query parameter `token`
- Verifica que el token no haya expirado

### Error: "Usuario no encontrado en la base de datos"

- El usuario debe estar registrado en la tabla `usuarios`
- Verifica que el `firebase_uid` coincida

### Error: "Clave interna inválida"

- Verifica que el `X-Internal-Key` header coincida con el secret `internal-api-key`

### WebSocket se desconecta constantemente

- Implementa heartbeat en el cliente (enviar "ping" cada 30 segundos)
- Verifica la configuración de red y proxies

## Notas de Seguridad

- ✅ Todas las conexiones WebSocket requieren autenticación con Firebase
- ✅ Solo usuarios con rol `cuidador` pueden conectarse
- ✅ El endpoint `/internal/notify-alert` requiere clave interna
- ✅ Conexión segura a Cloud SQL via Unix socket
- ✅ Secrets gestionados por Google Secret Manager

## Próximas Mejoras

- [ ] Implementar rate limiting
- [ ] Agregar métricas de Prometheus
- [ ] Implementar logs estructurados
- [ ] Agregar soporte para notificaciones de recordatorios
- [ ] Implementar rooms/channels para mejor organización
- [ ] Agregar compresión de mensajes
- [ ] Implementar retry automático en el backend

## Soporte

Para problemas o preguntas, contacta al equipo de desarrollo.
