# 🚀 Pasos Finales para Testing Completo

## Estado Actual del Proyecto

### ✅ Backend - Código Corregido (LOCAL)
- Fixes de transacciones SQLAlchemy
- Endpoints de solicitudes de cuidado funcionando
- ❌ **FALTA: Desplegar a Cloud Run**

### ✅ Frontend - Código Corregido (LOCAL)
- Alert.alert() reemplazado por window.confirm()
- Navegación corregida (router.push en lugar de router.back)
- Mensajes de error mejorados
- ✅ **YA FUNCIONA en desarrollo local**

---

## 📋 PASO 1: Desplegar Backend a Cloud Run

### Opción A: Desde Terminal (Recomendado)

```bash
# 1. Navegar a la carpeta del backend
cd c:\Users\acuri\Documents\Vigilia\Capstone\servicios\api-backend

# 2. Verificar que estás en el proyecto correcto
gcloud config get-value project
# Debe mostrar: composed-apogee-475623-p6

# Si no es correcto:
gcloud config set project composed-apogee-475623-p6

# 3. Construir la imagen Docker
gcloud builds submit --tag gcr.io/composed-apogee-475623-p6/api-backend:latest

# 4. Desplegar a Cloud Run
gcloud run deploy api-backend \
  --image gcr.io/composed-apogee-475623-p6/api-backend:latest \
  --platform managed \
  --region southamerica-west1 \
  --allow-unauthenticated
```

### Opción B: Desde Cloud Console (Si la terminal falla)

1. Ve a https://console.cloud.google.com/run
2. Selecciona `api-backend`
3. Click "EDIT & DEPLOY NEW REVISION"
4. Sube el archivo `main.py` actualizado
5. Click "DEPLOY"

---

## 🧪 PASO 2: Testing del Flujo Completo

### Test 1: Enviar Solicitud (Usuario Cuidador)

1. **Login como Usuario 1** (cuidador)
   - Email: `acurincordova@gmail.com` (o el que uses)

2. **Ir a Dashboard**
   - Debe ver opciones de cuidador

3. **Click "Agregar Persona"**
   - Pantalla de agregar persona se abre

4. **Ingresar email de Usuario 2**
   - Email: `acurincordova2@gmail.com` (usuario diferente)
   - Mensaje: "Hola, quiero cuidarte" (opcional)

5. **Click "Enviar Solicitud"**
   - ✅ Debe mostrar alert: "Solicitud enviada exitosamente"
   - ✅ Debe limpiar el formulario
   - ✅ Debe redirigir al dashboard

6. **Verificar en consola**
   - NO debe haber errores 500
   - Debe mostrar: `POST /solicitudes-cuidado 201 (Created)`

### Test 2: Ver Solicitud Recibida (Usuario Receptor)

1. **Logout** del Usuario 1

2. **Login como Usuario 2**
   - Email: `acurincordova2@gmail.com`

3. **En Dashboard**
   - ✅ Debe ver banner azul: "1 solicitud pendiente"
   - ✅ Badge con número "1"

4. **Click en el banner**
   - Redirige a pantalla de solicitudes

5. **Verificar contenido de la solicitud**
   - ✅ Nombre del cuidador: "Angelo" (o nombre de Usuario 1)
   - ✅ Email del cuidador
   - ✅ Mensaje: "Hola, quiero cuidarte"
   - ✅ Estado: Badge naranja "Pendiente"
   - ✅ Botones: "Aceptar" (verde) y "Rechazar" (rojo)

### Test 3: Aceptar Solicitud

1. **Click en "Aceptar"**
   - ✅ Debe mostrar confirm nativo: "¿Estás seguro...?"

2. **Click "Aceptar" en confirm**
   - ✅ Debe mostrar alert: "Solicitud aceptada exitosamente"
   - ✅ Debe redirigir al dashboard
   - ✅ En consola: `PUT /solicitudes-cuidado/X/aceptar 200 (OK)`

3. **Verificar cambio de rol**
   - Dashboard ahora muestra vista de "Adulto Mayor"
   - Ya NO ve opciones de cuidador

4. **Verificar en Base de Datos**
   ```sql
   -- El usuario debe tener rol 'adulto_mayor'
   SELECT * FROM usuarios WHERE email = 'acurincordova2@gmail.com';

   -- Debe existir entrada en adultos_mayores
   SELECT * FROM adultos_mayores WHERE usuario_id = X;

   -- Debe existir relación
   SELECT * FROM cuidadores_adultos_mayores;

   -- Solicitud debe estar aceptada
   SELECT * FROM solicitudes_cuidado WHERE id = X;
   ```

### Test 4: Verificar Relación (Usuario Cuidador)

1. **Logout** del Usuario 2

2. **Login como Usuario 1** (cuidador original)

3. **Click "Ver Personas a Cuidar"**
   - ✅ Debe mostrar card del Usuario 2
   - ✅ Con nombre completo
   - ✅ Información completa

4. **Verificar que puede gestionar**
   - Puede crear recordatorios para Usuario 2
   - Puede ver alertas de Usuario 2
   - Tiene permisos completos

### Test 5: Rechazar Solicitud (Escenario Alternativo)

1. **Usuario 1 envía solicitud a Usuario 3**

2. **Usuario 3 login**

3. **Ve solicitud, click "Rechazar"**
   - ✅ Confirm: "¿Estás seguro...?"
   - ✅ Alert: "Solicitud rechazada"

4. **Verificar**
   - Usuario 3 sigue siendo 'cuidador'
   - NO se crea relación
   - Solicitud marcada como 'rechazada'

---

## 🔍 PASO 3: Verificar Errores Comunes

### Error 1: Solicitud Duplicada

**Acción:** Usuario 1 envía solicitud a Usuario 2 dos veces

**Esperado:**
- ✅ Primera vez: Éxito
- ✅ Segunda vez: Error claro "Ya enviaste una solicitud a este usuario..."

### Error 2: Auto-Solicitud

**Acción:** Usuario intenta enviar solicitud a su propio email

**Esperado:**
- ✅ Error: "No puedes enviarte una solicitud a ti mismo"

### Error 3: Usuario no existe

**Acción:** Enviar solicitud a email que no está registrado

**Esperado:**
- ✅ Solicitud se crea (el email se guarda)
- Cuando ese usuario se registre, verá la solicitud

---

## 📊 PASO 4: Verificación en Base de Datos

### Consulta 1: Ver todas las solicitudes
```sql
SELECT
    sc.id,
    u1.email as cuidador_email,
    sc.email_destinatario,
    sc.estado,
    sc.fecha_solicitud
FROM solicitudes_cuidado sc
JOIN usuarios u1 ON sc.cuidador_id = u1.id
ORDER BY sc.fecha_solicitud DESC;
```

### Consulta 2: Ver relaciones cuidador-adulto mayor
```sql
SELECT
    u.email as cuidador_email,
    am.nombre_completo as adulto_mayor,
    cam.rol_cuidador
FROM cuidadores_adultos_mayores cam
JOIN usuarios u ON cam.usuario_id = u.id
JOIN adultos_mayores am ON cam.adulto_mayor_id = am.id;
```

### Consulta 3: Ver cambios de rol
```sql
SELECT
    email,
    nombre,
    rol,
    fecha_creacion
FROM usuarios
ORDER BY fecha_creacion DESC;
```

---

## 🐛 Troubleshooting

### Problema: "500 Internal Server Error" al enviar solicitud

**Causa:** Backend no está desplegado con los fixes

**Solución:**
1. Desplegar backend actualizado (PASO 1)
2. Verificar logs en Cloud Run Console
3. Revisar que DB_PASS esté configurado

### Problema: Botones Aceptar/Rechazar no hacen nada

**Causa:** Frontend no actualizado

**Solución:**
1. Refrescar página (Ctrl+R)
2. Limpiar caché del navegador
3. Verificar que los cambios en `solicitudes.tsx` se aplicaron

### Problema: "Ya existe una solicitud pendiente" pero no debería

**Causa:** Solicitud anterior no se completó correctamente

**Solución:**
```sql
-- Verificar estado de solicitudes
SELECT * FROM solicitudes_cuidado
WHERE cuidador_id = X AND usuario_destinatario_id = Y;

-- Si es necesario, limpiar solicitud pendiente
UPDATE solicitudes_cuidado
SET estado = 'rechazada'
WHERE id = X AND estado = 'pendiente';
```

### Problema: Dashboard no muestra banner de solicitudes

**Causa:** Contador no se actualizó

**Solución:**
1. Logout y login nuevamente
2. Verificar que `fetchSolicitudesPendientes()` se ejecuta en `index.tsx`
3. Revisar consola para errores de API

---

## ✅ Checklist Final

Antes de considerar completo:

- [ ] Backend desplegado en Cloud Run
- [ ] Test 1: Enviar solicitud ✅
- [ ] Test 2: Ver solicitud recibida ✅
- [ ] Test 3: Aceptar solicitud ✅
- [ ] Test 4: Relación cuidador-adulto funciona ✅
- [ ] Test 5: Rechazar solicitud ✅
- [ ] Verificado en base de datos ✅
- [ ] Errores comunes manejados correctamente ✅
- [ ] Sin errores en consola del navegador ✅
- [ ] Sin errores en logs de Cloud Run ✅

---

## 📝 Documentos de Referencia

1. `IMPLEMENTACION_SOLICITUDES_CUIDADO.md` - Documentación completa
2. `FIXES_TRANSACCIONES_SQL.md` - Correcciones de backend
3. `FIXES_FRONTEND_ALERTS.md` - Correcciones de frontend
4. `PASOS_FINALES_TESTING.md` - Este documento

---

## 🎉 Cuando Todo Funcione

¡Felicidades! Has implementado exitosamente:

✅ Sistema de solicitudes de cuidado con consentimiento
✅ Relación N-N entre cuidadores y adultos mayores
✅ Cambio automático de roles
✅ Validaciones de seguridad
✅ Manejo de errores robusto
✅ UI/UX completa

### Próximos pasos recomendados:

1. **Notificaciones Push** cuando se reciben/aceptan solicitudes
2. **Lista de cuidadores** para adultos mayores (gestión de múltiples cuidadores)
3. **Pantalla de detalles** de adulto mayor con edición
4. **Opción de remover relación** (desvincular cuidador-adulto)
5. **Filtros y búsqueda** en listas de personas

---

**Fecha:** 31 de Octubre, 2025
**Estado:** 🚀 Listo para deployment y testing final
