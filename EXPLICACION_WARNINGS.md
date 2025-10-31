# Explicación de Warnings y Soluciones

## Warning 1: "shadow*" style props are deprecated

### ⚠️ Warning Completo
```
"shadow*" style props are deprecated. Use "boxShadow".
```

### 📝 Explicación

Este warning aparece porque React Native Web recomienda usar la propiedad CSS estándar `boxShadow` en lugar de las propiedades específicas de React Native (`shadowColor`, `shadowOpacity`, `shadowOffset`, `shadowRadius`).

### 🔍 Por qué aparece

React Native usa propiedades de sombra separadas para iOS/Android:
```javascript
{
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.2,
  shadowRadius: 3,
  elevation: 5  // Android
}
```

React Native Web prefiere la sintaxis CSS estándar:
```javascript
{
  boxShadow: '0px 2px 3px rgba(0, 0, 0, 0.2)'
}
```

### ✅ Solución Implementada

**Opción 1: Dejar como está (Recomendado)**
- Las propiedades `shadow*` **SÍ funcionan** en React Native Web
- Son necesarias para iOS/Android
- El warning es solo informativo, no es un error
- La app funciona correctamente

**Opción 2: Usar Platform.select (Si quieres eliminar el warning)**
```javascript
...Platform.select({
  web: {
    boxShadow: '0px 2px 3px rgba(0, 0, 0, 0.2)'
  },
  default: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 5
  }
})
```

### 🎯 Recomendación

**Ignorar este warning** porque:
1. ✅ No afecta la funcionalidad
2. ✅ Las sombras se ven correctas en todas las plataformas
3. ✅ Es más mantenible usar el mismo código para todas las plataformas
4. ⚠️ Solo aparece en modo desarrollo, no en producción

---

## Warning 2: Layout children must be of type Screen

### ⚠️ Warning Completo
```
Layout children must be of type Screen, all other children are ignored.
To use custom children, create a custom <Layout />.
Update Layout Route at: "app/_layout"
```

### 📝 Explicación

Este warning aparece cuando una pantalla (archivo `.tsx`) existe en la carpeta `app/` pero no está declarada en el `<Stack>` del `_layout.tsx`.

### 🔍 Causa del Warning

Creaste el archivo `app/solicitudes.tsx` pero no lo agregaste al Stack Navigator en `_layout.tsx`.

Expo Router detectó el archivo pero no sabe cómo renderizarlo porque no está en la configuración del Stack.

### ✅ Solución Implementada

Agregamos la pantalla al Stack en `_layout.tsx`:

```typescript
// Antes (faltaba solicitudes)
<Stack.Screen name="perfil" options={{ title: 'Mi Perfil', headerShown: true }} />
<Stack.Screen name="ayuda" options={{ title: 'Ayuda', headerShown: true }} />
<Stack.Screen name="cuidador" options={{ headerShown: false }} />

// Después (con solicitudes agregado)
<Stack.Screen name="perfil" options={{ title: 'Mi Perfil', headerShown: true }} />
<Stack.Screen name="ayuda" options={{ title: 'Ayuda', headerShown: true }} />
<Stack.Screen name="solicitudes" options={{ title: 'Solicitudes de Cuidado', headerShown: false }} />
<Stack.Screen name="cuidador" options={{ headerShown: false }} />
```

### 🎯 Resultado

✅ Warning eliminado
✅ Navegación a `/solicitudes` funciona correctamente
✅ Header personalizado en la pantalla de solicitudes

---

## Problema Adicional Resuelto: Contador de Solicitudes

### 🐛 Problema

Después de aceptar/rechazar una solicitud, el banner seguía mostrando "1 solicitud pendiente" aunque ya no hubiera solicitudes pendientes.

### 🔍 Causa

El contador se cargaba una sola vez al iniciar sesión y no se actualizaba cuando:
- El usuario volvía de la pantalla de solicitudes
- Aceptaba/rechazaba una solicitud

### ✅ Solución Implementada

**1. Modificamos `fetchSolicitudesPendientes` para aceptar token opcional:**
```typescript
const fetchSolicitudesPendientes = useCallback(async (token?: string) => {
  const authToken = token || await getToken();
  // ... resto del código
}, [getToken]);
```

**2. Agregamos `useFocusEffect` para recargar al volver a la pantalla:**
```typescript
useFocusEffect(
  useCallback(() => {
    if (isAuthenticated && !isAuthLoading) {
      fetchSolicitudesPendientes();
    }
  }, [isAuthenticated, isAuthLoading, fetchSolicitudesPendientes])
);
```

### 🎯 Comportamiento Ahora

✅ Al volver de `/solicitudes` → Contador se actualiza
✅ Después de aceptar solicitud → Contador baja de 1 a 0
✅ Después de rechazar solicitud → Contador se actualiza
✅ Banner desaparece cuando no hay solicitudes pendientes

---

## Resumen de Cambios

### Archivos Modificados:

1. **`app/_layout.tsx`**
   - ✅ Agregada pantalla `solicitudes` al Stack
   - ✅ Warning de Layout eliminado

2. **`app/index.tsx`**
   - ✅ Importado `useFocusEffect`
   - ✅ Modificado `fetchSolicitudesPendientes` con token opcional
   - ✅ Agregado hook para recargar contador al enfocar pantalla
   - ✅ Contador ahora se actualiza dinámicamente

### Warnings Resueltos:

- ✅ **Layout children warning** → Solucionado
- ⚠️ **shadow* props warning** → Ignorable (solo informativo)

### Funcionalidad Mejorada:

- ✅ Contador de solicitudes se actualiza en tiempo real
- ✅ Banner desaparece cuando no hay solicitudes pendientes
- ✅ Navegación funciona correctamente
- ✅ No más warnings críticos en consola

---

## Testing Actualizado

### Test: Flujo Completo de Solicitud

1. **Usuario 1 envía solicitud a Usuario 2**
   - ✅ Usuario 2 ve banner: "1 solicitud pendiente"

2. **Usuario 2 va a `/solicitudes`**
   - ✅ Ve la solicitud
   - ✅ Click en "Rechazar"
   - ✅ Solicitud se marca como "Rechazada"

3. **Usuario 2 vuelve al dashboard**
   - ✅ Banner desaparece automáticamente
   - ✅ Contador muestra "0" (o se oculta completamente)

4. **Usuario 1 envía nueva solicitud**
   - ✅ Usuario 2 ve banner: "1 solicitud pendiente"
   - ✅ Click en banner → Va a `/solicitudes`

5. **Usuario 2 acepta la solicitud**
   - ✅ Solicitud aceptada
   - ✅ Vuelve al dashboard
   - ✅ Banner desaparece
   - ✅ Dashboard muestra vista de "Adulto Mayor"

---

## Notas Técnicas

### useFocusEffect vs useEffect

**useEffect:**
- Se ejecuta al montar el componente
- Se ejecuta cuando cambian las dependencias
- NO se ejecuta al volver de otra pantalla (si el componente ya estaba montado)

**useFocusEffect:**
- Se ejecuta cada vez que la pantalla obtiene foco
- Ideal para actualizar datos cuando el usuario vuelve
- Usado en navegación con tabs o stacks

### Por qué usar useFocusEffect aquí

```typescript
// Usuario en Dashboard (index.tsx)
// └─> Va a /solicitudes
//     └─> Rechaza solicitud
//         └─> Vuelve a Dashboard
//             └─> useFocusEffect se ejecuta ✅
//             └─> Contador se actualiza ✅
```

Sin `useFocusEffect`, el contador solo se actualizaría:
- Al hacer login
- Al recargar la página completa (F5)

Con `useFocusEffect`, el contador se actualiza:
- Al hacer login
- Al volver de otra pantalla
- Cada vez que la pantalla obtiene foco

---

**Fecha:** 31 de Octubre, 2025
**Estado:** ✅ Warnings resueltos, funcionalidad mejorada
