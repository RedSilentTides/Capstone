# Resumen de Correcciones - Script de Datos de Prueba

## Archivo Generado
- **Nuevo archivo:** `poblar_datos_test_corregido.sql`
- **Archivo original:** `poblar_datos_test.sql` (sin modificar, como referencia)

---

## Problemas Identificados en el Script Original

### 1. **Confusión entre IDs de Usuarios y IDs de Adultos Mayores**

**Problema:**
- El comentario decía: "Usuario ID 1 es cuidador de usuarios 2 y 3"
- Pero en la tabla `cuidadores_adultos_mayores` se usaban `adulto_mayor_id` (1, 2, 3, 4)
- **Los IDs de adultos mayores NO coinciden con los IDs de usuarios**

**Solución:**
- Aclaré que:
  - Usuario ID 2 (Alexander) → se vincula a Adulto Mayor ID 1
  - Usuario ID 3 (María Elena) → se vincula a Adulto Mayor ID 2
- Las relaciones en `cuidadores_adultos_mayores` ahora usan correctamente:
  - `(usuario_id=1, adulto_mayor_id=1)` - Angelo cuida a Alexander
  - `(usuario_id=1, adulto_mayor_id=2)` - Angelo cuida a María Elena

### 2. **Falta de Solicitudes de Cuidado que Expliquen las Relaciones Existentes**

**Problema:**
- El comentario decía: "Usuarios 2 y 3 ya aceptaron solicitud del usuario 1"
- Pero NO había solicitudes con estado 'aceptada' que reflejaran esto
- La solicitud en línea 150 tenía email incorrecto (`maria.torres@ejemplo.com` en lugar de `acurincordova3@gmail.com`)

**Solución:**
- Agregué 2 solicitudes ACEPTADAS:
  ```sql
  -- Usuario 1 → Usuario 2 (Alexander) - ACEPTADA hace 59 días
  -- Usuario 1 → Usuario 3 (María Elena) - ACEPTADA hace 49 días
  ```
- Estas solicitudes explican cómo se crearon los vínculos en `cuidadores_adultos_mayores`

### 3. **Nombre Duplicado: "Rosa Valenzuela"**

**Problema:**
- Rosa Valenzuela aparecía como:
  - Usuario ID 4 (Cuidador)
  - Adulto Mayor ID 4 (Sin usuario)
- Esto era confuso y causaba ambigüedad

**Solución:**
- Cambié el nombre del Adulto Mayor ID 4 a **"Carmen Gloria Muñoz Rojas"**
- Ahora Rosa Valenzuela solo es Usuario ID 4 (Cuidador)
- Carmen es adulto mayor bajo el cuidado de Rosa

### 4. **Falta de Comentarios y Documentación Clara**

**Problema:**
- El script original tenía comentarios mínimos
- No explicaba la relación entre usuario_id y adulto_mayor_id
- Los desarrolladores podían confundirse sobre qué ID usar

**Solución:**
- Agregué documentación extensa:
  - Tabla ASCII con los 4 usuarios creados
  - Explicación de relaciones existentes
  - Comentarios en cada sección
  - Consultas de verificación al final del script

### 5. **Datos Incompletos y Poco Realistas**

**Problema:**
- Nombres genéricos ("TEST4 Ramírez")
- Falta de detalles en descripciones médicas
- Algunos campos importantes vacíos

**Solución:**
- Nombres completos realistas con apellidos paterno y materno
- Direcciones completas con comuna y detalles
- Notas médicas más detalladas y útiles
- Detalles adicionales en eventos de caída más descriptivos

---

## Estructura de Datos Corregida

### Usuarios en la Base de Datos (Creados Previamente)
```
┌────┬──────────────────┬───────────────────────────┬─────────────────┐
│ ID │ Nombre           │ Email                     │ Rol             │
├────┼──────────────────┼───────────────────────────┼─────────────────┤
│ 1  │ Angelo           │ acurincordova@gmail.com   │ cuidador        │
│ 2  │ Alexander        │ acurincordova2@gmail.com  │ adulto_mayor    │
│ 3  │ María Elena      │ acurincordova3@gmail.com  │ adulto_mayor    │
│ 4  │ Rosa Valenzuela  │ acurincordova4@gmail.com  │ cuidador        │
└────┴──────────────────┴───────────────────────────┴─────────────────┘
```

### Adultos Mayores (Tabla adultos_mayores)
```
┌────────────────┬─────────────────────────────────┬────────────┬──────────────────────┐
│ adulto_mayor_id│ Nombre Completo                 │ usuario_id │ Cuidador             │
├────────────────┼─────────────────────────────────┼────────────┼──────────────────────┤
│ 1              │ Alexander González Pérez        │ 2          │ Angelo (usuario 1)   │
│ 2              │ María Elena Torres Guzmán       │ 3          │ Angelo (usuario 1)   │
│ 3              │ Pedro Antonio Ramírez Silva     │ NULL       │ Angelo (usuario 1)   │
│ 4              │ Carmen Gloria Muñoz Rojas       │ NULL       │ Rosa (usuario 4)     │
└────────────────┴─────────────────────────────────┴────────────┴──────────────────────┘
```

**Nota importante:**
- Adultos mayores con `usuario_id` → tienen cuenta en la app (pueden iniciar sesión)
- Adultos mayores con `usuario_id = NULL` → solo perfil administrativo (no pueden iniciar sesión)

### Relaciones Cuidador-Adulto Mayor
```
┌─────────────┬─────────────────┬────────────────┬─────────────────────────────────┬──────────────┐
│ Cuidador ID │ Nombre Cuidador │ Adulto Mayor ID│ Nombre Adulto Mayor             │ Rol Cuidador │
├─────────────┼─────────────────┼────────────────┼─────────────────────────────────┼──────────────┤
│ 1           │ Angelo          │ 1              │ Alexander González Pérez        │ Hijo         │
│ 1           │ Angelo          │ 2              │ María Elena Torres Guzmán       │ Hijo         │
│ 1           │ Angelo          │ 3              │ Pedro Antonio Ramírez Silva     │ Sobrino      │
│ 4           │ Rosa Valenzuela │ 4              │ Carmen Gloria Muñoz Rojas       │ Hija         │
└─────────────┴─────────────────┴────────────────┴─────────────────────────────────┴──────────────┘
```

### Solicitudes de Cuidado (Flujo Completo)

#### Solicitudes Aceptadas (que crearon los vínculos)
```sql
1. Usuario 1 → acurincordova2@gmail.com (Usuario 2) - ACEPTADA hace 59 días
   → Creó vínculo: Angelo cuida a Alexander

2. Usuario 1 → acurincordova3@gmail.com (Usuario 3) - ACEPTADA hace 49 días
   → Creó vínculo: Angelo cuida a María Elena
```

#### Solicitudes Pendientes
```sql
3. Usuario 1 → nuevo.adultomayor@ejemplo.com - PENDIENTE (2 días)
4. Usuario 4 → familiar.rosa@ejemplo.com - PENDIENTE (5 días)
```

#### Solicitudes Rechazadas
```sql
5. Usuario 4 → persona.independiente@ejemplo.com - RECHAZADA hace 14 días
```

---

## Datos de Prueba Incluidos

### Adultos Mayores
- **4 adultos mayores** (2 con usuario vinculado, 2 sin usuario)

### Dispositivos
- **6 dispositivos** en total:
  - 5 asignados a adultos mayores
  - 1 sin asignar (laboratorio de pruebas)
  - Estados: activo (4), mantenimiento (1), inactivo (1)

### Eventos de Caída
- **9 eventos** de caída registrados:
  - 3 confirmados como caídas reales
  - 3 marcados como falsas alarmas
  - 3 pendientes de confirmación
  - Rango de confianza: 0.65 a 0.95

### Recordatorios
- **17 recordatorios** en total:
  - 14 pendientes (próximos)
  - 3 históricos (confirmados/enviados)
  - Tipos: medicamentos, citas médicas, fisioterapia, actividades

### Configuraciones de Alerta
- **2 configuraciones** (una por cuidador)
  - Usuario 1: app + WhatsApp + email
  - Usuario 4: app + email (sin WhatsApp)

### Suscripciones
- **2 suscripciones activas**
  - Usuario 1: Plan Premium
  - Usuario 4: Plan Básico

### Solicitudes de Cuidado
- **5 solicitudes** en total:
  - 2 aceptadas (históricas)
  - 2 pendientes
  - 1 rechazada

---

## Mejoras Implementadas

### 1. **Coherencia de Datos**
- Todas las relaciones ahora son lógicamente consistentes
- Los IDs se corresponden correctamente entre tablas
- Las solicitudes aceptadas explican los vínculos existentes

### 2. **Datos Realistas**
- Nombres completos con apellidos
- Direcciones detalladas con comuna
- Notas médicas específicas y útiles
- Descripciones de eventos con contexto

### 3. **Documentación Completa**
- Tabla ASCII con usuarios al inicio
- Comentarios explicativos en cada sección
- Consultas de verificación al final
- Consultas útiles para debugging

### 4. **Facilidad de Uso**
- Sección de limpieza opcional comentada
- Consultas de verificación listas para ejecutar
- Formato legible con secciones bien delimitadas
- Comentarios que explican el propósito de cada insert

### 5. **Casos de Prueba Completos**
- Cubre todos los estados posibles (pendiente, aceptada, rechazada)
- Incluye tanto adultos mayores con usuario como sin usuario
- Dispositivos en diferentes estados
- Recordatorios con diferentes frecuencias
- Eventos de caída confirmados, rechazados y pendientes

---

## Cómo Usar el Script

### 1. **Prerrequisitos**
Asegúrate de que los 4 usuarios estén creados en Firebase y en la tabla `usuarios`:
```sql
SELECT id, nombre, email, rol FROM usuarios WHERE id IN (1, 2, 3, 4);
```

### 2. **Ejecutar el Script**
```bash
psql -h [HOST] -U [USER] -d [DATABASE] -f poblar_datos_test_corregido.sql
```

O desde el cliente psql:
```sql
\i servicios/poblar_datos_test_corregido.sql
```

### 3. **Verificar Datos**
Ejecuta las consultas de verificación al final del script:
```sql
SELECT COUNT(*) as total_adultos_mayores FROM adultos_mayores;  -- Debe dar 4
SELECT COUNT(*) as total_relaciones FROM cuidadores_adultos_mayores;  -- Debe dar 4
SELECT COUNT(*) as total_dispositivos FROM dispositivos;  -- Debe dar 6
SELECT COUNT(*) as total_caidas FROM eventos_caida;  -- Debe dar 9
SELECT COUNT(*) as total_recordatorios FROM recordatorios;  -- Debe dar 17
```

### 4. **Limpiar Datos (Opcional)**
Si necesitas reiniciar, descomenta las líneas de DELETE al inicio del script (líneas 29-36).

---

## Consultas Útiles para Testing

### Ver adultos mayores con sus cuidadores
```sql
SELECT
    u.nombre as cuidador_nombre,
    am.nombre_completo as adulto_mayor_nombre,
    cam.rol_cuidador
FROM cuidadores_adultos_mayores cam
JOIN usuarios u ON cam.usuario_id = u.id
JOIN adultos_mayores am ON cam.adulto_mayor_id = am.id
ORDER BY u.id, am.id;
```

### Ver solicitudes de cuidado completas
```sql
SELECT
    uc.nombre as cuidador,
    sc.email_destinatario,
    sc.estado,
    sc.fecha_solicitud,
    sc.fecha_respuesta
FROM solicitudes_cuidado sc
JOIN usuarios uc ON sc.cuidador_id = uc.id
ORDER BY sc.fecha_solicitud DESC;
```

### Ver eventos de caída recientes
```sql
SELECT
    am.nombre_completo,
    d.nombre_dispositivo,
    ec.timestamp_caida,
    ec.confirmado_por_usuario,
    ec.detalles_adicionales->>'confidence' as confianza
FROM eventos_caida ec
JOIN dispositivos d ON ec.dispositivo_id = d.id
LEFT JOIN adultos_mayores am ON d.adulto_mayor_id = am.id
ORDER BY ec.timestamp_caida DESC
LIMIT 5;
```

### Ver recordatorios próximos
```sql
SELECT
    am.nombre_completo,
    r.titulo,
    r.fecha_hora_programada,
    r.frecuencia
FROM recordatorios r
JOIN adultos_mayores am ON r.adulto_mayor_id = am.id
WHERE r.estado = 'pendiente'
  AND r.fecha_hora_programada > NOW()
ORDER BY r.fecha_hora_programada ASC
LIMIT 10;
```

---

## Diferencias Clave con el Script Original

| Aspecto | Script Original | Script Corregido |
|---------|----------------|------------------|
| **Coherencia IDs** | IDs inconsistentes | IDs correctamente mapeados |
| **Solicitudes** | 3 solicitudes genéricas | 5 solicitudes que explican vínculos |
| **Nombres** | "TEST4 Ramírez" | Nombres completos realistas |
| **Documentación** | Mínima | Extensa con tablas ASCII |
| **Datos médicos** | Básicos | Detallados y específicos |
| **Verificación** | 8 consultas COUNT | 8 COUNT + 4 consultas complejas |
| **Eventos caída** | 7 eventos | 9 eventos con más contexto |
| **Dispositivos** | 5 dispositivos | 6 dispositivos (incluyendo LAB) |

---

## Recomendaciones

1. **Usa el nuevo script** `poblar_datos_test_corregido.sql` para poblar tu base de datos

2. **Guarda el script original** como referencia histórica

3. **Ejecuta las consultas de verificación** después de poblar para asegurar consistencia

4. **Revisa las relaciones** usando las consultas útiles proporcionadas

5. **Ajusta los timestamps** si necesitas datos más recientes (todas las fechas usan `NOW()` con intervalos)

---

## Contacto y Soporte

Si encuentras algún problema con el script o necesitas modificaciones adicionales, revisa:
- Documentación de la base de datos: `servicios/TablasVersio3.sql`
- Código de la API: `servicios/api-backend/main.py`

---

**Fecha de creación:** 2025-11-01
**Versión:** 2.0 Corregida
**Autor:** Claude Code (Asistente de IA)
