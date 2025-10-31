# Implementación: Sistema de Solicitudes de Cuidado

## Resumen

Se ha implementado un sistema completo de solicitudes de cuidado que permite a los usuarios cuidadores enviar solicitudes a otros usuarios para establecer relaciones de cuidado de manera segura y con consentimiento explícito.

---

## Cambios en Base de Datos

### Tabla: `solicitudes_cuidado`

Ya creada en PostgreSQL con la siguiente estructura:

```sql
CREATE TABLE solicitudes_cuidado (
    id SERIAL PRIMARY KEY,
    cuidador_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    email_destinatario VARCHAR(100) NOT NULL,
    usuario_destinatario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
    estado VARCHAR(50) DEFAULT 'pendiente', -- 'pendiente', 'aceptada', 'rechazada'
    mensaje TEXT,
    fecha_solicitud TIMESTAMPTZ DEFAULT NOW(),
    fecha_respuesta TIMESTAMPTZ
);
```

---

## Backend (API)

### Archivo modificado: `servicios/api-backend/main.py`

### Nuevos Modelos Pydantic

```python
class SolicitudCuidadoCreate(BaseModel):
    email_destinatario: EmailStr
    mensaje: str | None = None

class SolicitudCuidadoInfo(BaseModel):
    id: int
    cuidador_id: int
    email_destinatario: str
    usuario_destinatario_id: int | None
    estado: str
    mensaje: str | None
    fecha_solicitud: datetime
    fecha_respuesta: datetime | None
    nombre_cuidador: str | None = None
    email_cuidador: str | None = None

class AdultoMayorInfo(BaseModel):
    id: int
    usuario_id: int | None
    nombre_completo: str
    fecha_nacimiento: datetime | None
    direccion: str | None
    notas_relevantes: str | None
    token_fcm_app_adulto: str | None
    fecha_registro: datetime
```

### Endpoints Implementados

#### **1. POST /solicitudes-cuidado** - Enviar Solicitud
- **Permisos:** Solo cuidadores
- **Función:** Enviar solicitud de cuidado a otro usuario por email
- **Validaciones:**
  - No puede enviarse a sí mismo
  - No puede haber solicitudes pendientes duplicadas
- **Retorna:** Información de la solicitud creada

#### **2. GET /solicitudes-cuidado/recibidas** - Ver Solicitudes Recibidas
- **Permisos:** Todos los usuarios autenticados
- **Función:** Obtener solicitudes de cuidado recibidas
- **Incluye:** Información del cuidador que envió la solicitud
- **Retorna:** Array de solicitudes ordenadas por fecha (más recientes primero)

#### **3. GET /solicitudes-cuidado/enviadas** - Ver Solicitudes Enviadas
- **Permisos:** Solo cuidadores
- **Función:** Obtener solicitudes de cuidado enviadas por el cuidador
- **Retorna:** Array de solicitudes ordenadas por fecha

#### **4. PUT /solicitudes-cuidado/{id}/aceptar** - Aceptar Solicitud
- **Permisos:** Usuario destinatario de la solicitud
- **Función:** Aceptar una solicitud de cuidado
- **Acciones realizadas en transacción:**
  1. Cambia el rol del usuario a 'adulto_mayor'
  2. Crea registro en tabla `adultos_mayores` (o lo reutiliza si existe)
  3. Crea relación en `cuidadores_adultos_mayores`
  4. Marca solicitud como 'aceptada' con fecha de respuesta
- **Validaciones:**
  - Solo el destinatario puede aceptar
  - Solo solicitudes pendientes pueden aceptarse
- **Retorna:** Información de la solicitud actualizada

#### **5. PUT /solicitudes-cuidado/{id}/rechazar** - Rechazar Solicitud
- **Permisos:** Usuario destinatario de la solicitud
- **Función:** Rechazar una solicitud de cuidado
- **Acciones:**
  - Marca solicitud como 'rechazada' con fecha de respuesta
- **Validaciones:**
  - Solo el destinatario puede rechazar
  - Solo solicitudes pendientes pueden rechazarse
- **Retorna:** Información de la solicitud actualizada

#### **6. GET /adultos-mayores** - Listar Adultos Mayores
- **Permisos:** Cuidadores y administradores
- **Función:** Obtener lista de adultos mayores asignados al cuidador
- **Retorna:** Array de adultos mayores ordenados alfabéticamente

#### **7. GET /adultos-mayores/{id}** - Ver Detalles de Adulto Mayor
- **Permisos:** Cuidadores y administradores (con verificación de relación)
- **Función:** Obtener detalles de un adulto mayor específico
- **Retorna:** Información completa del adulto mayor

#### **8. PUT /adultos-mayores/{id}** - Actualizar Adulto Mayor
- **Permisos:** Cuidadores y administradores (con verificación de relación)
- **Función:** Actualizar información de un adulto mayor
- **Campos actualizables:**
  - nombre_completo
  - fecha_nacimiento
  - direccion
  - notas_relevantes
- **Retorna:** Información actualizada del adulto mayor

---

## Frontend (React Native / Expo)

### Nuevas Pantallas Creadas

#### **1. `app/cuidador/agregar-persona.tsx`** - Enviar Solicitud de Cuidado

**Características:**
- Formulario para ingresar email del destinatario
- Campo opcional para mensaje personalizado
- Validación de formato de email
- Prevención de envío a sí mismo
- Feedback visual de carga
- Manejo de errores detallado
- Navegación de regreso después de envío exitoso

**Componentes:**
- Header con navegación hacia atrás
- Icono de UserPlus
- Input de email con validación
- TextArea para mensaje opcional
- Botones de acción (Enviar/Cancelar)

#### **2. `app/solicitudes.tsx`** - Ver Solicitudes Recibidas

**Características:**
- Lista de solicitudes recibidas
- Indicador visual de estado (pendiente/aceptada/rechazada)
- Pull-to-refresh
- Información del remitente
- Mensaje personalizado (si existe)
- Acciones para aceptar/rechazar solicitudes pendientes
- Confirmación antes de aceptar/rechazar
- Estado vacío con mensaje descriptivo

**Componentes por solicitud:**
- Card con estado de color
- Avatar e información del cuidador
- Email y fecha de solicitud
- Mensaje personalizado (si hay)
- Botones de acción (Aceptar/Rechazar) - solo para pendientes
- Fecha de respuesta para solicitudes procesadas

#### **3. `app/cuidador/adultos-mayores.tsx`** - Listar Adultos Mayores

**Características:**
- Lista de adultos mayores asignados
- Pull-to-refresh
- Navegación a detalles (preparado para futuro)
- Estado vacío con llamado a acción
- Contador de personas
- Botón flotante para agregar nueva persona

**Componentes por adulto mayor:**
- Card con avatar
- Nombre y edad calculada
- Fecha de nacimiento formateada
- Dirección (si existe)
- Notas relevantes (si existen)
- Fecha de registro

### Pantallas Modificadas

#### **`app/index.tsx`** - Dashboard Principal

**Cambios realizados:**

1. **Imports actualizados:**
   - Agregado `UserPlus` y `Users` de lucide-react-native

2. **Nuevo estado:**
   ```typescript
   const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);
   ```

3. **Nueva función:**
   ```typescript
   const fetchSolicitudesPendientes = useCallback(async (token: string) => {
     // Obtiene solicitudes pendientes para mostrar badge
   }, []);
   ```

4. **Dashboard del Cuidador - Nuevas secciones:**

   a) **Banner de Notificaciones** (si hay solicitudes pendientes):
   - Muestra número de solicitudes pendientes
   - Badge con contador
   - Click para ir a `/solicitudes`
   - Diseño llamativo con borde azul

   b) **Sección "Gestión de Personas":**
   - Botón "Ver Personas a Cuidar" → `/cuidador/adultos-mayores`
   - Botón "Agregar Persona" → `/cuidador/agregar-persona`
   - Iconos de Users y UserPlus

5. **Dashboard del Adulto Mayor:**
   - Mismo banner de notificaciones para solicitudes pendientes
   - Permite aceptar/rechazar solicitudes de cuidadores

6. **Nuevos estilos:**
   ```typescript
   greenButton: { backgroundColor: '#10b981' }
   notificationBanner: { /* Estilos del banner */ }
   notificationContent: { /* Layout del contenido */ }
   notificationText: { /* Textos de notificación */ }
   notificationTitle: { /* Título destacado */ }
   notificationSubtitle: { /* Subtítulo */ }
   notificationBadge: { /* Badge circular */ }
   notificationBadgeText: { /* Texto del badge */ }
   ```

---

## Flujo Completo de Uso

### Escenario: Juan (cuidador) quiere cuidar a María

#### **Paso 1: Juan envía solicitud**
1. Juan inicia sesión como cuidador
2. En el dashboard, presiona "Agregar Persona"
3. Ingresa el email de María: `maria@email.com`
4. (Opcional) Escribe mensaje: "Hola María, me gustaría cuidarte"
5. Presiona "Enviar Solicitud"
6. Sistema crea solicitud en BD con estado 'pendiente'

#### **Paso 2: María recibe notificación**
1. María inicia sesión (como cuidador, su rol por defecto)
2. En el dashboard ve un banner azul: "1 solicitud pendiente"
3. Presiona el banner para ir a `/solicitudes`
4. Ve la solicitud de Juan con:
   - Nombre de Juan
   - Email de Juan
   - Mensaje personalizado
   - Fecha de envío

#### **Paso 3: María decide aceptar**
1. María presiona botón "Aceptar"
2. Aparece confirmación explicando que:
   - Su rol cambiará a "Adulto Mayor"
   - Se creará relación con Juan como cuidador
3. María confirma
4. Sistema ejecuta en transacción:
   ```
   a. UPDATE usuarios SET rol = 'adulto_mayor' WHERE id = maria_id
   b. INSERT INTO adultos_mayores (usuario_id, nombre_completo)
      VALUES (maria_id, 'María')
   c. INSERT INTO cuidadores_adultos_mayores (usuario_id, adulto_mayor_id)
      VALUES (juan_id, maria_adulto_id)
   d. UPDATE solicitudes_cuidado SET estado = 'aceptada',
      fecha_respuesta = NOW() WHERE id = solicitud_id
   ```

#### **Paso 4: Relación establecida**
1. María ve mensaje de confirmación
2. Su dashboard cambia a vista de "Adulto Mayor"
3. Juan puede ahora:
   - Ver a María en "Personas a Cuidar"
   - Crear recordatorios para María
   - Ver alertas de dispositivos de María
   - Acceder a información de María

### Flujo Alternativo: María rechaza

1. María presiona botón "Rechazar"
2. Confirma la acción
3. Sistema marca solicitud como 'rechazada'
4. María sigue siendo 'cuidador'
5. No se crea ninguna relación
6. Juan puede ver en sus solicitudes enviadas que fue rechazada

---

## Seguridad y Validaciones

### Backend
1. **Autenticación:** Todos los endpoints requieren token de Firebase válido
2. **Autorización por roles:**
   - Solo cuidadores pueden enviar solicitudes
   - Solo destinatario puede aceptar/rechazar
3. **Validaciones de negocio:**
   - No auto-envío de solicitudes
   - No duplicar solicitudes pendientes
   - Solo solicitudes pendientes pueden procesarse
4. **Transacciones:** Aceptar solicitud usa transacción para garantizar atomicidad
5. **Verificación de relaciones:** Endpoints de adultos mayores verifican relación con cuidador

### Frontend
1. **Validación de email:** Regex para formato correcto
2. **Confirmaciones:** Dialogs antes de aceptar/rechazar
3. **Feedback visual:** Loading states y error handling
4. **Navegación segura:** Verificación de autenticación en todas las rutas

---

## Próximos Pasos Recomendados

### Funcionalidades Pendientes
1. **Notificaciones Push:**
   - Notificar al destinatario cuando recibe solicitud
   - Notificar al cuidador cuando solicitud es aceptada/rechazada

2. **Pantalla de detalles de adulto mayor:**
   - Crear `app/cuidador/adultos-mayores/[id].tsx`
   - Mostrar información completa
   - Formulario de edición
   - Lista de dispositivos asociados
   - Historial de alertas

3. **Gestión de múltiples cuidadores:**
   - Permitir que un adulto mayor tenga múltiples cuidadores
   - Vista para adulto mayor de sus cuidadores
   - Opción de remover relación

4. **Mejoras UX:**
   - Búsqueda de adultos mayores
   - Filtros por estado
   - Ordenamiento personalizado
   - Paginación para listas grandes

### Testing
1. **Backend:**
   - Tests unitarios para endpoints
   - Tests de integración para flujo completo
   - Tests de seguridad (permisos)

2. **Frontend:**
   - Tests de navegación
   - Tests de formularios
   - Tests de estados de carga/error

---

## Notas Técnicas

### Manejo de Estados de Usuario
- Por defecto, todos los usuarios nuevos son 'cuidador'
- Al aceptar una solicitud, el rol cambia a 'adulto_mayor'
- Un adulto mayor puede tener múltiples cuidadores
- La tabla `adultos_mayores` se crea automáticamente al aceptar primera solicitud

### Performance
- Las consultas usan índices en tablas relacionadas
- Pull-to-refresh permite actualizar datos sin recargar app
- Contador de solicitudes pendientes se carga una vez por sesión

### Compatibilidad
- Código compatible con iOS, Android y Web (Expo)
- Uso de SecureStore para móvil, AsyncStorage para web
- Estilos adaptativos con elevation para Android, shadow para iOS

---

## Resumen de Archivos Modificados/Creados

### Backend
- ✅ `servicios/TablasVersio3.sql` - Tabla `solicitudes_cuidado` agregada
- ✅ `servicios/api-backend/main.py` - 8 nuevos endpoints agregados

### Frontend
- ✅ `frontend-vigilia/app/cuidador/agregar-persona.tsx` - NUEVO
- ✅ `frontend-vigilia/app/solicitudes.tsx` - NUEVO
- ✅ `frontend-vigilia/app/cuidador/adultos-mayores.tsx` - NUEVO
- ✅ `frontend-vigilia/app/index.tsx` - MODIFICADO (dashboard actualizado)

### Documentación
- ✅ `IMPLEMENTACION_SOLICITUDES_CUIDADO.md` - Este documento

---

## Contacto y Soporte

Para cualquier duda o issue con la implementación, revisar:
1. Logs del backend en Cloud Run
2. Console del navegador/app para errores de frontend
3. Verificar permisos de Firebase Auth
4. Revisar conexiones a Cloud SQL

---

**Fecha de implementación:** 31 de Octubre, 2025
**Versión:** 1.0
**Estado:** ✅ Completado y listo para testing
