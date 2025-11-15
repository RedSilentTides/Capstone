# Instrucciones para Resetear la Base de Datos

## ⚠️ ADVERTENCIA
Este proceso eliminará **TODOS** los datos de la base de datos, pero mantendrá la estructura de tablas. Los contadores de IDs se resetearán a 1.

## Pasos para ejecutar el script

### Opción 1: Usando Google Cloud Console (Recomendado)

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Navega a **SQL** en el menú lateral
3. Selecciona tu instancia de Cloud SQL
4. Haz clic en **ABRIR CLOUD SHELL** (botón superior derecho)
5. Ejecuta el siguiente comando para conectarte:
   ```bash
   gcloud sql connect [NOMBRE-INSTANCIA] --user=postgres --quiet
   ```
6. Ingresa la contraseña cuando se solicite
7. Una vez conectado, ejecuta:
   ```sql
   \c vigilia_db
   ```
8. Copia y pega el contenido del archivo `TruncarBaseDatos.sql`
9. Presiona Enter para ejecutar

### Opción 2: Usando el cliente psql local

1. Abre tu terminal
2. Conecta a tu base de datos Cloud SQL:
   ```bash
   psql "host=[IP-CLOUD-SQL] port=5432 dbname=vigilia_db user=postgres sslmode=require"
   ```
3. Ejecuta el script:
   ```bash
   \i "C:/Users/acuri/Documents/Vigilia/Capstone/servicios/Scripts sql/TruncarBaseDatos.sql"
   ```

### Opción 3: Usando gcloud CLI

```bash
gcloud sql connect [NOMBRE-INSTANCIA] --user=postgres --quiet < "C:/Users/acuri/Documents/Vigilia/Capstone/servicios/Scripts sql/TruncarBaseDatos.sql"
```

## Qué hace el script

1. **Desactiva temporalmente los constraints** para permitir el truncado
2. **Trunca todas las tablas** en el orden correcto:
   - solicitudes_cuidado
   - suscripciones
   - recordatorios
   - alertas
   - configuraciones_alerta
   - dispositivos
   - cuidadores_adultos_mayores
   - adultos_mayores
   - usuarios
3. **Resetea los contadores de ID** (SERIAL) a 1
4. **Reactiva los constraints**
5. **Muestra un resumen** de las tablas vacías

## Después de ejecutar el script

### 1. Resetear Firebase Authentication

Ve a [Firebase Console](https://console.firebase.google.com/):
1. Selecciona tu proyecto
2. Ve a **Authentication** → **Users**
3. Selecciona todos los usuarios y elimínalos
4. **IMPORTANTE**: Esto no afectará a las cuentas de Google de los usuarios, solo sus registros en este proyecto

### 2. Limpiar Google Cloud Storage (opcional)

Si quieres eliminar también las imágenes/videos almacenados:

```bash
# Listar buckets
gsutil ls

# Eliminar todo el contenido de un bucket (¡CUIDADO!)
gsutil -m rm -r gs://[NOMBRE-BUCKET]/**

# O eliminar solo snapshots de caídas
gsutil -m rm -r gs://[NOMBRE-BUCKET]/fall-snapshots/**
```

### 3. Verificar que todo esté limpio

Ejecuta esta query para verificar:

```sql
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    (SELECT COUNT(*) FROM usuarios) as usuarios,
    (SELECT COUNT(*) FROM adultos_mayores) as adultos_mayores,
    (SELECT COUNT(*) FROM alertas) as alertas,
    (SELECT COUNT(*) FROM recordatorios) as recordatorios
FROM pg_tables
WHERE schemaname = 'public'
LIMIT 1;
```

Todos los contadores deberían estar en 0.

## Crear usuarios de prueba

Después del reset, puedes crear nuevos usuarios desde la app o usando Firebase Console.

### Ejemplo de usuario de prueba (Firebase):
1. Ve a Firebase Console → Authentication → Add user
2. Crea usuario con email/password
3. Anota el UID generado
4. Inserta manualmente en la base de datos:

```sql
INSERT INTO usuarios (firebase_uid, nombre, email, hash_contrasena, rol)
VALUES
    ('TU-FIREBASE-UID', 'Usuario Prueba', 'prueba@ejemplo.com', 'firebase_managed', 'cuidador');
```

## Notas importantes

- ✅ La estructura de tablas se mantiene intacta
- ✅ Los índices y constraints se mantienen
- ✅ Los comentarios y metadata de tablas se mantienen
- ⚠️ Los datos se eliminan permanentemente
- ⚠️ Los contadores de ID se resetean a 1
- ⚠️ Este proceso es **IRREVERSIBLE** en producción

## Comandos útiles para verificar

```sql
-- Ver todas las tablas y su cantidad de registros
SELECT
    schemaname,
    tablename,
    (SELECT COUNT(*) FROM usuarios) as usuarios,
    (SELECT COUNT(*) FROM alertas) as alertas
FROM pg_tables
WHERE schemaname = 'public';

-- Ver el próximo ID que se asignará
SELECT
    'usuarios' as tabla,
    last_value as proximo_id
FROM usuarios_id_seq;

-- Ver el tamaño de la base de datos
SELECT
    pg_size_pretty(pg_database_size('vigilia_db')) as database_size;
```
