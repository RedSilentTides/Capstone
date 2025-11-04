# Instrucciones: Configuración de Dispositivos NanoPi

## Cambios Implementados

Se ha agregado un sistema completo para configurar y asociar dispositivos NanoPi con adultos mayores, permitiendo vincular el hardware_id (MAC address) con un adulto mayor específico.

### Componentes Modificados:

1. **Base de Datos** - Nueva migración SQL
2. **Backend API** - Nuevos endpoints y modelos
3. **Frontend Mobile** - Nueva UI para configuración
4. **Procesador de Videos** - Actualizado para incluir adulto_mayor_id

---

## Paso 1: Aplicar Migración SQL

La migración agrega campos a la tabla `dispositivos` para almacenar:
- `adulto_mayor_id` - Relación con el adulto mayor
- `usuario_camara` - Usuario para acceder a la cámara
- `contrasena_camara_encrypted` - Contraseña (temporal sin encriptar, TODO en producción)
- `fecha_configuracion` - Timestamp de última configuración

### Aplicar la migración:

```powershell
# Conectar a Cloud SQL
gcloud sql connect vigilia-db-main --user=postgres --database=postgres

# Dentro de psql, ejecutar:
\i C:/Users/acuri/Documents/Vigilia/Capstone/servicios/api-backend/migrations/add_camera_credentials.sql

# Verificar que se aplicó
\d dispositivos

# Salir
\q
```

**Alternativamente**, puedes ejecutar la migración directamente:

```powershell
Get-Content "c:\Users\acuri\Documents\Vigilia\Capstone\servicios\api-backend\migrations\add_camera_credentials.sql" | gcloud sql connect vigilia-db-main --user=postgres --database=postgres
```

---

## Paso 2: Redesplegar el Backend

El backend ahora tiene un nuevo endpoint `/dispositivos/configurar` y el endpoint `/dispositivos/get-or-create` ahora retorna también el `adulto_mayor_id`.

```powershell
cd c:\Users\acuri\Documents\Vigilia\Capstone\servicios\api-backend
.\deploy-api-backend.ps1
```

**Tiempo estimado:** 5-7 minutos

---

## Paso 3: Redesplegar el Procesador de Videos

El procesador ahora envía el `adulto_mayor_id` cuando notifica una caída al backend.

```powershell
cd c:\Users\acuri\Documents\Vigilia\Capstone\servicios\procesador-videos
.\deploy-gcp.ps1
```

**Tiempo estimado:** 8-10 minutos

Durante el deployment, se te pedirá confirmar que el secret `internal-api-key` existe. Si hay un problema con el secret, consulta [FIX-403-FORBIDDEN.md](servicios/procesador-videos/FIX-403-FORBIDDEN.md).

---

## Paso 4: Probar el Flujo Completo

### 4.1 Configurar el Dispositivo en el Frontend

1. Abre la app móvil VigilIA
2. Inicia sesión como cuidador
3. Ve a "Ver Personas a Cuidar"
4. Selecciona un adulto mayor (por ejemplo, el de ID 1)
5. En la página de detalles, encontrarás la sección "Dispositivo NanoPi"
6. Toca "Configurar Dispositivo"
7. Ingresa los datos:
   - **Hardware ID:** `bec1a2c71301` (tu MAC address de prueba)
   - **Usuario Cámara:** El usuario de tu cámara (ejemplo: `admin`)
   - **Contraseña Cámara:** La contraseña de tu cámara
8. Toca "Guardar"

Deberías ver un mensaje de éxito.

### 4.2 Verificar en la Base de Datos

```powershell
gcloud sql connect vigilia-db-main --user=postgres --database=postgres
```

```sql
-- Ver el dispositivo configurado
SELECT id, nombre_dispositivo, identificador_hw, adulto_mayor_id, usuario_camara, fecha_configuracion
FROM dispositivos
WHERE identificador_hw = 'bec1a2c71301';

-- Salir
\q
```

### 4.3 Probar Subida de Video

Sube un video de prueba:

```powershell
cd c:\Users\acuri\Documents\Vigilia\Capstone\servicios\procesador-videos
gsutil cp fall.mp4 gs://nanopi-videos-input/bec1a2c71301/fall_test_$(Get-Date -Format "yyyyMMdd_HHmmss").mp4
```

### 4.4 Monitorear los Logs

```powershell
# Logs del procesador
gcloud run services logs read procesador-videos --region southamerica-west1 --limit 30
```

**Logs esperados:**

```
📬 Evento recibido para el archivo: gs://nanopi-videos-input/bec1a2c71301/fall_test_...
Consultando al backend por el ID de hardware: bec1a2c71301
✅ Backend devolvió el ID de dispositivo numérico: 1, Adulto Mayor ID: 1
Descargando video...
✅ Video descargado.
Iniciando procesamiento de video...
🚨 ¡Posible caída detectada!...
Resultado del análisis: Caída detectada
Enviando notificación de caída al backend para el dispositivo ID: 1, Adulto Mayor ID: 1
✅ Notificación de caída enviada exitosamente
```

### 4.5 Verificar la Alerta en el Frontend

1. En la app móvil, ve a "Alertas" o actualiza el dashboard
2. Deberías ver una nueva alerta de caída asociada al adulto mayor
3. La alerta debería mostrar el nombre del adulto mayor correcto

---

## Estructura del Flujo Completo

```
1. CONFIGURACIÓN (Una sola vez por dispositivo)
   ┌─────────────────────────────────────────┐
   │ Cuidador configura en app móvil:        │
   │ - Hardware ID: bec1a2c71301             │
   │ - Adulto Mayor: Juan Pérez (ID: 1)      │
   │ - Credenciales de cámara                │
   └──────────────┬──────────────────────────┘
                  │
                  ▼
   ┌─────────────────────────────────────────┐
   │ Backend: POST /dispositivos/configurar  │
   │ - Crea/actualiza registro en DB         │
   │ - Asocia hardware_id con adulto_mayor_id│
   └─────────────────────────────────────────┘

2. MONITOREO DE CAÍDAS (Continuo)
   ┌─────────────────────────────────────────┐
   │ NanoPi: Sube video                       │
   │ gs://nanopi-videos-input/               │
   │   bec1a2c71301/video_XXX.mp4            │
   └──────────────┬──────────────────────────┘
                  │
                  ▼ (Cloud Storage Notification)
   ┌─────────────────────────────────────────┐
   │ Procesador: Recibe evento Pub/Sub       │
   │ 1. Extrae hardware_id de la ruta         │
   │ 2. Llama GET /dispositivos/get-or-create│
   │    Response: {id: 1, adulto_mayor_id: 1}│
   │ 3. Descarga y procesa video              │
   │ 4. Si detecta caída:                     │
   │    POST /eventos-caida/notificar         │
   │    {dispositivo_id: 1,                   │
   │     adulto_mayor_id: 1, ...}            │
   └──────────────┬──────────────────────────┘
                  │
                  ▼
   ┌─────────────────────────────────────────┐
   │ Backend: Crea alerta                     │
   │ - Asociada al adulto mayor correcto      │
   │ - Notifica a cuidadores                  │
   └──────────────┬──────────────────────────┘
                  │
                  ▼
   ┌─────────────────────────────────────────┐
   │ App Móvil: Muestra alerta                │
   │ "⚠️ Caída detectada - Juan Pérez"      │
   └─────────────────────────────────────────┘
```

---

## Verificaciones de Seguridad

### ⚠️ IMPORTANTE para Producción:

La contraseña de la cámara actualmente se almacena **sin encriptar** en la base de datos. Esto está marcado con `TODO` en el código.

**Antes de ir a producción, debes:**

1. Implementar encriptación de contraseñas (AES-256 o similar)
2. Usar Cloud KMS para gestionar las claves de encriptación
3. Nunca exponer las contraseñas en logs o respuestas API

---

## Troubleshooting

### Error: "No tienes permiso para configurar este adulto mayor"

**Causa:** El adulto mayor no está asociado al cuidador autenticado.

**Solución:** Verifica que el cuidador esté vinculado al adulto mayor en la tabla `cuidador_adulto_mayor`.

### Error: "Secret 'internal-api-key' no existe"

**Causa:** El procesador necesita el secret de Secret Manager.

**Solución:** Ver [FIX-403-FORBIDDEN.md](servicios/procesador-videos/FIX-403-FORBIDDEN.md)

### No se crea la alerta después de subir el video

**Pasos de debugging:**

1. Verificar logs del procesador:
   ```powershell
   gcloud run services logs read procesador-videos --region southamerica-west1 --limit 50
   ```

2. Verificar que el dispositivo está configurado:
   ```sql
   SELECT * FROM dispositivos WHERE identificador_hw = 'bec1a2c71301';
   ```

3. Verificar logs del backend:
   ```powershell
   gcloud run services logs read api-backend --region southamerica-west1 --limit 50
   ```

---

## Próximos Pasos Sugeridos

1. **Encriptar contraseñas** - Implementar encriptación antes de producción
2. **Validación de hardware_id** - Agregar validación de formato MAC address
3. **UI para editar configuración** - Permitir modificar credenciales de cámara
4. **UI para ver dispositivos** - Lista de dispositivos configurados
5. **Desasociar dispositivo** - Permitir desasociar un dispositivo de un adulto mayor

---

## Resumen de Archivos Modificados

### Backend (`servicios/api-backend/`)
- ✅ `main.py` - Líneas 943-1135 (nuevos modelos y endpoints)
- ✅ `migrations/add_camera_credentials.sql` - Nueva migración

### Procesador (`servicios/procesador-videos/`)
- ✅ `main.py` - Líneas 81-109, 107-133, 167-186 (actualizaciones)

### Frontend (`frontend-vigilia/`)
- ✅ `app/(app)/cuidador/adultos-mayores/[id].tsx` - Líneas 1-756 (nueva UI)

---

**¿Listo para desplegar?** Sigue los pasos 1-4 en orden y estarás operativo en ~20 minutos! 🚀
