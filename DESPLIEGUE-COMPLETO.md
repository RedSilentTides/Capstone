# Guía de Despliegue Completo - Sistema de Notificaciones VigilIA

Esta guía te ayudará a desplegar el sistema completo de notificaciones en tiempo real usando WebSocket.

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SISTEMA VIGILIA                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐         ┌──────────────┐        ┌──────────────┐     │
│  │  Frontend    │         │  API Backend │        │   WebSocket  │     │
│  │  (Expo App)  │◄───────►│  (FastAPI)   │◄──────►│   Service    │     │
│  │              │         │              │        │  (FastAPI)   │     │
│  └──────────────┘         └──────────────┘        └──────────────┘     │
│       │                          │                       │              │
│       │ Firebase Auth            │ Cloud SQL             │ Cloud SQL    │
│       ▼                          ▼                       ▼              │
│  ┌──────────────┐         ┌──────────────┐        ┌──────────────┐     │
│  │   Firebase   │         │  PostgreSQL  │        │  PostgreSQL  │     │
│  │     Auth     │         │   Database   │        │   Database   │     │
│  └──────────────┘         └──────────────┘        └──────────────┘     │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘

FLUJO DE NOTIFICACIONES:
1. Adulto Mayor presiona botón de ayuda (Frontend)
2. Frontend envía POST /alertas a API Backend
3. API Backend crea alerta en PostgreSQL
4. API Backend notifica:
   a) Push notification a tokens registrados
   b) HTTP POST al WebSocket Service
5. WebSocket Service envía mensaje a cuidadores conectados
6. Cuidadores reciben notificación instantánea
```

## Paso 1: Desplegar el Servicio WebSocket

### 1.1 Verificar archivos necesarios

Navega a la carpeta del servicio:

```powershell
cd c:\Users\acuri\Documents\Vigilia\Capstone\servicios\alertas-websocket
```

Verifica que existan estos archivos:
- ✅ `main.py` - Servidor WebSocket
- ✅ `requirements.txt` - Dependencias Python
- ✅ `Dockerfile` - Configuración del contenedor
- ✅ `deploy-websocket.ps1` - Script de despliegue
- ✅ `README.md` - Documentación

### 1.2 Autenticarse en Google Cloud

```powershell
gcloud auth login
gcloud config set project composed-apogee-475623-p6
```

### 1.3 Desplegar el servicio

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

### 1.4 Obtener la URL del servicio

Después del despliegue, obtendrás una URL como:
```
https://alertas-websocket-687053793381.southamerica-west1.run.app
```

**IMPORTANTE:** Copia esta URL, la necesitarás para el siguiente paso.

### 1.5 Verificar que el servicio esté funcionando

```powershell
curl https://alertas-websocket-687053793381.southamerica-west1.run.app/health
```

Deberías ver una respuesta como:
```json
{
  "status": "healthy",
  "service": "alertas-websocket",
  "connected_users": 0,
  "timestamp": "2025-11-03T..."
}
```

## Paso 2: Actualizar y Redesplegar API Backend

### 2.1 Verificar cambios en main.py

Los cambios ya están hechos en `servicios/api-backend/main.py`. Ahora el código:
- ✅ Envía push notifications (comportamiento existente)
- ✅ Notifica al servicio WebSocket cuando se crea una alerta (NUEVO)

### 2.2 (Opcional) Configurar variable de entorno

Si la URL del servicio WebSocket es diferente, puedes configurarla:

```powershell
gcloud run services update api-backend `
  --region southamerica-west1 `
  --set-env-vars WEBSOCKET_SERVICE_URL=https://alertas-websocket-687053793381.southamerica-west1.run.app
```

Si no configuras esta variable, usará el valor por defecto que ya está en el código.

### 2.3 Redesplegar API Backend

```powershell
cd c:\Users\acuri\Documents\Vigilia\Capstone\servicios\api-backend
.\deploy-api-backend.ps1
```

### 2.4 Verificar el despliegue

```powershell
curl https://api-backend-687053793381.southamerica-west1.run.app/health
```

## Paso 3: Actualizar Frontend (NO requiere despliegue)

El frontend ya está actualizado con:
- ✅ Servicio WebSocket (`services/websocketService.ts`)
- ✅ Integración en `NotificationContext.tsx`
- ✅ Polling reducido a 5 segundos

**NO NECESITAS HACER NADA** en el frontend. Los cambios ya están en tu código local.

## Paso 4: Probar el Sistema Completo

### 4.1 Probar en Web (WebSocket)

1. **Abrir la app en el navegador:**
   ```powershell
   cd c:\Users\acuri\Documents\Vigilia\Capstone\frontend-vigilia
   npx expo start
   ```
   Presiona `W` para abrir en web

2. **Iniciar sesión como cuidador** (Angelo)

3. **Verificar en la consola del navegador:**
   ```
   ✅ WebSocket conectado exitosamente
   🌐 Inicializando conexión WebSocket...
   ```

4. **En otra pestaña/ventana, iniciar sesión como adulto mayor** (Alexander)

5. **Presionar el botón de ayuda**

6. **En la pestaña del cuidador, deberías ver:**
   ```
   📨 Mensaje WebSocket recibido: nueva_alerta
   🔔 Nueva alerta recibida via WebSocket: {...}
   🚨 ALERTA: Alexander ha solicitado ayuda!
   ```

### 4.2 Probar en Móvil (Polling + Push)

1. **Escanear el QR code con Expo Go**

2. **Iniciar sesión como cuidador**

3. **Verificar en los logs:**
   ```
   🌐 WebSocket solo disponible en web, en móvil se usa push/polling
   🔄 Activando polling para alertas (modo desarrollo)
   ```

4. **Crear alerta desde otro dispositivo**

5. **El cuidador recibirá:**
   - Notificación local en máximo 5 segundos (polling)
   - Badge en el dashboard actualizado

## Paso 5: Monitoreo y Logs

### 5.1 Ver logs del WebSocket Service

```powershell
gcloud run services logs read alertas-websocket --region southamerica-west1 --limit 50
```

O en tiempo real:

```powershell
gcloud run services logs tail alertas-websocket --region southamerica-west1
```

### 5.2 Ver logs del API Backend

```powershell
gcloud run services logs tail api-backend --region southamerica-west1
```

### 5.3 Logs que debes buscar

**Cuando se crea una alerta:**
```
✅ Alerta creada (tipo: ayuda) para adulto mayor 1
📱 Notificaciones push enviadas a 2 cuidadores
🌐 Notificación WebSocket enviada: 1 cuidadores conectados
```

**En el WebSocket Service:**
```
✅ WebSocket conectado: Angelo (firebase_uid)
📢 Alerta enviada a 1/2 cuidadores conectados
```

## Paso 6: Verificar Estadísticas

### 6.1 Ver usuarios conectados al WebSocket

```powershell
curl https://alertas-websocket-687053793381.southamerica-west1.run.app/stats
```

Respuesta:
```json
{
  "connected_users_count": 1,
  "connected_firebase_uids": ["7MsB2j1gr3Yk5PXqBRGkEBGFVkk1"],
  "timestamp": "2025-11-03T..."
}
```

## Comparación: Antes vs Después

### ANTES (Solo Polling)
```
Adulto Mayor presiona botón
        ↓
API crea alerta en BD
        ↓
Cuidador espera hasta 10 segundos (polling)
        ↓
Notificación recibida

⏱️ Latencia: 0-10 segundos
```

### DESPUÉS (WebSocket + Polling)
```
Adulto Mayor presiona botón
        ↓
API crea alerta en BD
        ├─→ Push notification (móvil)
        └─→ WebSocket notification (web)
               ↓
        Cuidador notificado INSTANTÁNEAMENTE

⏱️ Latencia: <1 segundo (web), 0-5 segundos (móvil con polling)
```

## Solución de Problemas

### Problema: WebSocket no conecta

**Verificar:**
1. ¿El servicio está desplegado?
   ```powershell
   gcloud run services list | findstr alertas-websocket
   ```

2. ¿El servicio responde?
   ```powershell
   curl https://alertas-websocket-687053793381.southamerica-west1.run.app/health
   ```

3. ¿El usuario está autenticado?
   - Verificar en la consola del navegador que hay un token de Firebase

### Problema: API Backend no notifica al WebSocket

**Verificar logs:**
```powershell
gcloud run services logs read api-backend --region southamerica-west1 | findstr WebSocket
```

**Buscar:**
- ❌ "Timeout al contactar servicio WebSocket"
- ❌ "Error al notificar via WebSocket"

**Solución:**
- Verificar que la URL del WebSocket Service esté correcta
- Verificar que el `internal-api-key` coincida en ambos servicios

### Problema: Cuidador no recibe notificaciones

**Verificar:**
1. ¿Está en web o móvil?
   - Web: debe ver "WebSocket conectado"
   - Móvil: debe ver "Activando polling"

2. ¿El rol es correcto?
   ```
   Rol de usuario obtenido: cuidador
   ```

3. ¿Hay relación con el adulto mayor?
   - Verificar en la base de datos tabla `relaciones_cuidador`

## Comandos Útiles

### Redesplegar todo el sistema

```powershell
# 1. WebSocket Service
cd c:\Users\acuri\Documents\Vigilia\Capstone\servicios\alertas-websocket
.\deploy-websocket.ps1

# 2. API Backend
cd c:\Users\acuri\Documents\Vigilia\Capstone\servicios\api-backend
.\deploy-api-backend.ps1

# 3. Frontend (no requiere despliegue, solo reiniciar)
cd c:\Users\acuri\Documents\Vigilia\Capstone\frontend-vigilia
# Ctrl+C para detener Expo
npx expo start
```

### Ver todos los servicios

```powershell
gcloud run services list --region southamerica-west1
```

### Ver secretos

```powershell
gcloud secrets list
```

## Próximos Pasos (Opcional)

1. **Implementar notificaciones browser en web:**
   - Usar Web Notifications API
   - Mostrar notificación visual incluso si la pestaña no está activa

2. **Agregar sonido a notificaciones web:**
   - Crear archivo de audio en `assets/sounds/`
   - Reproducir al recibir alerta via WebSocket

3. **Dashboard de monitoreo:**
   - Crear página `/admin/monitoring`
   - Mostrar usuarios conectados en tiempo real
   - Gráficos de alertas por hora/día

4. **Configurar alertas en GCP:**
   - Alertas si el servicio cae
   - Alertas si no hay conexiones WebSocket en X tiempo
   - Alertas si el tiempo de respuesta es muy alto

## Conclusión

¡Felicidades! Has desplegado un sistema completo de notificaciones en tiempo real con:

- ✅ WebSocket para notificaciones instantáneas en web
- ✅ Polling optimizado (5 seg) para móvil en desarrollo
- ✅ Push notifications para producción (cuando configures EAS)
- ✅ Arquitectura escalable en Google Cloud Run
- ✅ Persistencia de alertas para usuarios offline
- ✅ Reconexión automática si se cae el WebSocket

**Documentación adicional:**
- [README WebSocket Service](servicios/alertas-websocket/README.md)
- [Instrucciones Push Notifications](INSTRUCCIONES-NOTIFICACIONES-PUSH.md)
