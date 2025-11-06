# Templates de WhatsApp Requeridos para VigilIA

Para que las notificaciones personalizadas funcionen con el número de test (y en producción), necesitas crear estos templates en Meta Business Manager.

## ¿Por qué necesitamos templates?

Los números de WhatsApp Business (especialmente los de test) **NO pueden enviar mensajes de texto libre**. Solo pueden enviar:
1. **Templates pre-aprobados** por Meta
2. **Respuestas dentro de 24 horas** a mensajes iniciados por el usuario

Por eso necesitamos crear templates para cada tipo de notificación.

---

## Template 1: Alerta de Caída

### Información del Template:
- **Nombre**: `alerta_caida`
- **Categoría**: UTILITY
- **Idioma**: Español (es)

### Contenido:
```
🚨 *Alerta de Caída Detectada*

Se ha detectado una posible caída de {{1}}.

Por favor, verifica su estado inmediatamente.

_- VigilIA App_
```

### Variables:
- {{1}} = Nombre del adulto mayor

---

## Template 2: Solicitud de Ayuda

### Información del Template:
- **Nombre**: `solicitud_ayuda`
- **Categoría**: UTILITY
- **Idioma**: Español (es)

### Contenido:
```
🆘 *Solicitud de Ayuda Urgente*

{{1}} necesita ayuda.

Por favor, comunícate con él/ella lo antes posible.

_- VigilIA App_
```

### Variables:
- {{1}} = Nombre del adulto mayor

---

## Template 3: Recordatorio de Medicamento

### Información del Template:
- **Nombre**: `recordatorio_medicamento`
- **Categoría**: UTILITY
- **Idioma**: Español (es)

### Contenido:
```
⏰ *Recordatorio de Medicamento*

Es hora de que {{1}} tome su medicamento: {{2}}

_- VigilIA App_
```

### Variables:
- {{1}} = Nombre del adulto mayor
- {{2}} = Nombre del medicamento

---

## Cómo crear estos templates en Meta Business Manager

1. Ve a https://business.facebook.com/
2. Selecciona tu WhatsApp Business Account
3. Ve a: **Administrador de WhatsApp → Plantillas de mensajes**
4. Haz clic en **"Crear plantilla"**
5. Para cada template:
   - Ingresa el **nombre** (ej: `alerta_caida`)
   - Selecciona **categoría**: UTILITY
   - Selecciona **idioma**: Español
   - En el cuerpo del mensaje, copia el contenido exacto
   - Agrega las variables usando el botón **"Agregar variable"** ({{1}}, {{2}}, etc.)
   - Envía para aprobación
6. **Espera la aprobación** (puede tomar algunas horas o hasta 24 horas)

---

## Después de crear los templates

Una vez que los templates estén aprobados, necesitarás actualizar el código del servicio de WhatsApp para usar estos templates en lugar de mensajes de texto libre.

Te ayudaré con eso una vez que los templates estén creados y aprobados.

---

## Alternativa temporal: Usar solo templates genéricos

Si necesitas una solución inmediata mientras esperamos la aprobación de los templates, podemos:

1. Usar solo el template `hello_world` para todas las notificaciones
2. Enviar un link/botón que lleve al usuario a la app para ver los detalles
3. Esto funcionará pero será menos informativo

---

## Para producción

Para usar un número de producción (sin limitaciones de test):

1. Verifica un número de WhatsApp Business real en Meta
2. Los templates seguirán siendo necesarios para iniciar conversaciones
3. Pero después de que el usuario responda, podrás enviar mensajes libres por 24 horas

---

## Estado actual

✅ Servicio de WhatsApp: FUNCIONANDO
✅ Token configurado correctamente
✅ Número de test funcionando
⚠️  Templates personalizados: PENDIENTES DE CREACIÓN

Una vez que crees y se aprueben los templates, te ayudaré a actualizar el código para usarlos.
