# Correcciones de Errores de Transacciones SQLAlchemy

## Problema Encontrado

Error: `"This connection has already initiated a SQLAlchemy Transaction via begin() or autobegin()"`

## Causa

SQLAlchemy requiere que `trans = db_conn.begin()` se llame **ANTES** de ejecutar cualquier consulta SQL. Si ejecutas consultas antes de `begin()`, SQLAlchemy crea automáticamente una transacción implícita, y luego falla cuando intentas crear otra con `begin()`.

## Archivos Corregidos

### 1. `servicios/api-backend/main.py`

Se corrigieron 3 endpoints:

#### ✅ Endpoint: `POST /solicitudes-cuidado` (Líneas 900-970)

**Cambio:** Movido `trans = db_conn.begin()` al inicio, antes de todas las consultas SELECT.

**Antes:**
```python
with engine.connect() as db_conn:
    # ❌ SELECT queries here
    query_check_user = text("SELECT ...")
    destinatario = db_conn.execute(...)

    trans = db_conn.begin()  # ← Error!
```

**Después:**
```python
with engine.connect() as db_conn:
    trans = db_conn.begin()  # ✅ PRIMERO
    try:
        # Ahora sí, consultas dentro de la transacción
        query_check_user = text("SELECT ...")
        destinatario = db_conn.execute(...)
```

#### ✅ Endpoint: `PUT /solicitudes-cuidado/{id}/aceptar` (Líneas 1140-1162)

**Cambio:** Movida la consulta `SELECT nombre, email FROM usuarios` ANTES del `commit()`.

**Antes:**
```python
result = db_conn.execute(query_update_solicitud, ...).fetchone()
trans.commit()  # ← Commit cierra la transacción

# ❌ Consulta DESPUÉS del commit
query_cuidador = text("SELECT nombre, email ...")
cuidador_info = db_conn.execute(...)  # Error!
```

**Después:**
```python
# ✅ Consulta ANTES del commit
query_cuidador = text("SELECT nombre, email ...")
cuidador_info = db_conn.execute(...)

result = db_conn.execute(query_update_solicitud, ...).fetchone()
trans.commit()  # Ahora todo está dentro de la transacción
```

#### ✅ Endpoint: `PUT /solicitudes-cuidado/{id}/rechazar` (Líneas 1217-1239)

**Cambio:** Igual que el anterior, movida la consulta del cuidador antes del commit.

## Regla General

### ✅ Estructura Correcta

```python
with engine.connect() as db_conn:
    trans = db_conn.begin()  # 1. Iniciar transacción PRIMERO
    try:
        # 2. Todas las consultas aquí (SELECT, INSERT, UPDATE, DELETE)
        query1 = text("SELECT ...")
        result1 = db_conn.execute(query1, ...).fetchone()

        query2 = text("INSERT ...")
        result2 = db_conn.execute(query2, ...).fetchone()

        # 3. Commit al final
        trans.commit()

        # 4. Usar resultados para respuesta
        return Response(**result2._mapping)

    except HTTPException:
        trans.rollback()
        raise
    except Exception as e:
        trans.rollback()
        raise HTTPException(500, detail=str(e))
```

### ❌ Estructura Incorrecta

```python
with engine.connect() as db_conn:
    # ❌ Consultas ANTES de begin()
    result1 = db_conn.execute(...)

    trans = db_conn.begin()  # Error!

    # O también:
    trans = db_conn.begin()
    result = db_conn.execute(...)
    trans.commit()

    # ❌ Consultas DESPUÉS de commit()
    result2 = db_conn.execute(...)  # Error!
```

## Pasos para Actualizar

1. **Copiar el archivo corregido:**
   ```bash
   # El archivo main.py ya está corregido localmente
   ```

2. **Desplegar a Cloud Run:**
   ```bash
   cd c:\Users\acuri\Documents\Vigilia\Capstone\servicios\api-backend

   # Construir imagen
   gcloud builds submit --tag gcr.io/composed-apogee-475623-p6/api-backend:latest

   # Desplegar
   gcloud run deploy api-backend \
     --image gcr.io/composed-apogee-475623-p6/api-backend:latest \
     --platform managed \
     --region southamerica-west1 \
     --allow-unauthenticated
   ```

3. **Verificar que funcione:**
   - Prueba enviar una solicitud de cuidado
   - Prueba aceptar una solicitud
   - Prueba rechazar una solicitud

## Testing Recomendado

Después de desplegar, prueba estos escenarios:

### Test 1: Enviar Solicitud
```
Usuario A (cuidador) → Envía solicitud a email de Usuario B
✅ Debe crear solicitud con estado 'pendiente'
```

### Test 2: Aceptar Solicitud
```
Usuario B → Acepta solicitud de Usuario A
✅ Debe:
  - Cambiar rol de Usuario B a 'adulto_mayor'
  - Crear registro en adultos_mayores
  - Crear relación en cuidadores_adultos_mayores
  - Marcar solicitud como 'aceptada'
```

### Test 3: Rechazar Solicitud
```
Usuario B → Rechaza solicitud de Usuario A
✅ Debe marcar solicitud como 'rechazada'
❌ NO debe crear relación ni cambiar rol
```

## Verificación de Logs

En Cloud Run Console, revisa los logs para verificar:

```
✅ Solicitud creada con ID: X
✅ Rol actualizado a 'adulto_mayor' para usuario X
✅ Registro de adulto mayor creado con ID: X
✅ Relación creada: cuidador X -> adulto mayor Y
✅ Solicitud X aceptada exitosamente
```

## Otros Endpoints Verificados

Los siguientes endpoints NO tienen este problema:
- ✅ `POST /register`
- ✅ `GET /usuarios/yo`
- ✅ `DELETE /usuarios/yo`
- ✅ `GET /configuracion/`
- ✅ `PUT /configuracion/`
- ✅ `GET /eventos-caida`
- ✅ `POST /recordatorios`
- ✅ `GET /recordatorios`
- ✅ `PUT /recordatorios/{id}`
- ✅ `DELETE /recordatorios/{id}`
- ✅ `GET /solicitudes-cuidado/recibidas`
- ✅ `GET /solicitudes-cuidado/enviadas`
- ✅ `GET /adultos-mayores`
- ✅ `GET /adultos-mayores/{id}`
- ✅ `PUT /adultos-mayores/{id}`

---

**Fecha:** 31 de Octubre, 2025
**Estado:** ✅ Corregido - Listo para despliegue
