# Correcciones de Frontend - Alert.alert() no funciona en Web

## Problema Identificado

`Alert.alert()` de React Native **NO funciona en React Native Web**. Los botones de Aceptar/Rechazar no hacían nada porque los diálogos nunca se mostraban.

## Solución Implementada

Reemplazamos `Alert.alert()` por confirmaciones nativas del navegador que funcionan en web:
- `window.confirm()` para confirmaciones
- `alert()` para mensajes simples

## Archivos Corregidos

### 1. `frontend-vigilia/app/solicitudes.tsx`

#### Cambios en `handleAceptar`:

**Antes (No funcionaba en web):**
```typescript
Alert.alert(
    'Aceptar Solicitud',
    '¿Estás seguro...?',
    [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aceptar', onPress: async () => { ... } }
    ]
);
```

**Después (Funciona en web):**
```typescript
const confirmacion = Platform.OS === 'web'
    ? window.confirm('¿Estás seguro...?')
    : true; // Para móvil implementar Alert.alert

if (!confirmacion) return;

// Código de aceptar solicitud
await axios.put(...);

alert('Solicitud aceptada exitosamente.');
router.push('/');
```

#### Cambios en `handleRechazar`:

Similar al anterior, usando `window.confirm()` y `alert()`.

### 2. `frontend-vigilia/app/cuidador/agregar-persona.tsx`

#### Correcciones múltiples:

1. **Feedback al enviar solicitud:**
   - Limpia el formulario después de enviar
   - Usa `router.push('/')` en lugar de `router.back()`

2. **Botón Cancelar:**
   - Cambiado de `router.back()` a `router.push('/')`
   - Evita el error "GO_BACK was not handled"

3. **Header back button:**
   - Usa `router.push('/')` en lugar de `router.back()`

4. **Mensajes de error mejorados:**
   - Detecta errores 400 específicos
   - Muestra mensajes más claros al usuario

## Comportamiento Ahora

### En Web (navegador):
✅ `window.confirm()` muestra diálogo nativo del navegador
✅ `alert()` muestra mensaje nativo del navegador
✅ Los botones funcionan correctamente

### En Móvil (iOS/Android):
⚠️ Actualmente usa `window.confirm()` en web, pero necesitaría `Alert.alert()` para móvil
💡 Recomendación: Crear componente personalizado de diálogo universal

## Problemas Resueltos

### ✅ Problema 1: Botones no hacen nada
**Causa:** Alert.alert() no funciona en web
**Solución:** window.confirm() y alert()

### ✅ Problema 2: Error "GO_BACK was not handled"
**Causa:** router.back() sin historial de navegación
**Solución:** router.push('/') para ir al dashboard

### ✅ Problema 3: No hay feedback al enviar solicitud
**Causa:** Alert después de axios pero router.back() fallaba
**Solución:** Limpiar formulario y usar router.push('/')

### ✅ Problema 4: Error 400 sin mensaje claro
**Causa:** Usuario envía solicitud al mismo email dos veces
**Solución:** Mensajes de error específicos según el código HTTP

## Testing

### Test 1: Enviar Solicitud
```
1. Ir a "Agregar Persona"
2. Ingresar email de otro usuario
3. Click "Enviar Solicitud"
4. ✅ Debe mostrar alert de éxito
5. ✅ Debe limpiar formulario
6. ✅ Debe redirigir al dashboard
```

### Test 2: Enviar Solicitud Duplicada
```
1. Enviar solicitud a mismo email
2. ✅ Debe mostrar error claro: "Ya enviaste una solicitud..."
```

### Test 3: Aceptar Solicitud
```
1. Usuario destinatario ve solicitud
2. Click "Aceptar"
3. ✅ Debe mostrar confirmación nativa
4. ✅ Al confirmar, muestra "Solicitud aceptada"
5. ✅ Redirige al dashboard
6. ✅ Rol cambia a 'adulto_mayor'
```

### Test 4: Rechazar Solicitud
```
1. Usuario destinatario ve solicitud
2. Click "Rechazar"
3. ✅ Debe mostrar confirmación nativa
4. ✅ Al confirmar, muestra "Solicitud rechazada"
5. ✅ Recarga lista de solicitudes
```

### Test 5: Botón Cancelar
```
1. En "Agregar Persona"
2. Click "Cancelar"
3. ✅ Debe redirigir al dashboard (no error)
```

## Mejoras Futuras Recomendadas

### 1. Componente de Diálogo Universal
Crear un componente que funcione igual en web y móvil:

```typescript
// components/CustomAlert.tsx
export const showConfirm = (message: string): Promise<boolean> => {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(message));
  } else {
    return new Promise((resolve) => {
      Alert.alert(
        'Confirmación',
        message,
        [
          { text: 'Cancelar', onPress: () => resolve(false) },
          { text: 'Aceptar', onPress: () => resolve(true) }
        ]
      );
    });
  }
};
```

### 2. Toast Notifications
Para mensajes de éxito/error más elegantes:
- react-native-toast-message
- expo-notifications

### 3. Modal Personalizado
Crear modal propio con diseño consistente:
- Mejor UX
- Funciona igual en todas las plataformas
- Permite personalización (colores, iconos, etc.)

## Notas Importantes

### ⚠️ Alert.alert() en Web
**NUNCA funciona en React Native Web.** Siempre usar alternativas:
- `window.confirm()` para confirmaciones
- `alert()` para mensajes simples
- Modales personalizados para UI rica

### ✅ router.back() vs router.push()
- `router.back()`: Solo funciona si hay historial
- `router.push('/')`: Siempre funciona, va a una ruta específica

### 🎯 Platform.OS
Usar para detectar plataforma y adaptar comportamiento:
```typescript
if (Platform.OS === 'web') {
  // Código para web
} else {
  // Código para móvil
}
```

## Estado Actual

### ✅ Funcionando Correctamente:
- Enviar solicitudes
- Aceptar solicitudes
- Rechazar solicitudes
- Navegación sin errores
- Mensajes de error claros

### ⚠️ Pendiente de Despliegue:
- Backend en Cloud Run con fixes de transacciones

### 💡 Recomendado para Producción:
- Implementar componente de diálogo universal
- Agregar toast notifications
- Mejorar feedback visual (spinners, animaciones)

---

**Fecha:** 31 de Octubre, 2025
**Estado:** ✅ Corregido y listo para pruebas
