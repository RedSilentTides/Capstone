# Arquitectura de Despliegue y Almacenamiento - VigilIA

## Resumen Ejecutivo

VigilIA es un sistema de monitoreo inteligente para adultos mayores que utiliza detección de caídas basada en IA. La arquitectura está desplegada principalmente en Google Cloud Platform (GCP) con componentes edge en las viviendas de los usuarios.

**Proyecto GCP:** `composed-apogee-475623-p6`
**Región Principal:** `southamerica-west1` (Santiago, Chile)

---

## 1. Componentes de Infraestructura

### 1.1 Cloud Run Services

| Servicio | URL | Descripción |
|----------|-----|-------------|
| **api-backend** | `api-backend-687053793381.southamerica-west1.run.app` | API REST principal (FastAPI). Gestiona usuarios, alertas, recordatorios, dispositivos. |
| **alertas-websocket** | `alertas-websocket-687053793381.southamerica-west1.run.app` | Servidor WebSocket para notificaciones en tiempo real. |
| **api-email** | `api-email-687053793381.southamerica-west1.run.app` | Microservicio de envío de emails vía SendGrid. |
| **whatsapp-webhook** | `whatsapp-webhook-687053793381.southamerica-west1.run.app` | Webhook para integración con Meta WhatsApp Business API. |
| **procesador-video** | `procesador-video-687053793381.southamerica-west1.run.app` | Procesamiento de videos (servicio auxiliar, no activo). |

### 1.2 Cloud SQL (PostgreSQL)

| Atributo | Valor |
|----------|-------|
| **Instancia** | `vigilia-db-main` |
| **Versión** | PostgreSQL 17 |
| **Región** | `southamerica-west1` |
| **Tier** | `db-custom-2-8192` (2 vCPU, 8GB RAM) |
| **Base de Datos** | `postgres` |

### 1.3 Cloud Storage

| Bucket | Uso |
|--------|-----|
| `nanopi-videos-input` | Almacenamiento de snapshots de caídas detectadas |
| `composed-apogee-475623-p6_cloudbuild` | Artefactos de Cloud Build |

### 1.4 Firebase Services

| Servicio | Identificador | Uso |
|----------|---------------|-----|
| **Hosting** | `app-vigilia.web.app` | Frontend web (React Native Web) |
| **Authentication** | - | Autenticación de usuarios (email/password) |

### 1.5 Secret Manager

| Secreto | Descripción |
|---------|-------------|
| `vigilia-db-password` | Contraseña de PostgreSQL |
| `internal-api-key` | API key para comunicación entre servicios |
| `SENDGRID_API_KEY` | API key de SendGrid para emails |
| `whatsapp-api-key` | API key de Meta WhatsApp |
| `whatsapp-token` | Token de acceso WhatsApp |
| `webhook-api-key` | Autenticación de webhooks |
| `webhook-verify-token` | Token de verificación Meta |

### 1.6 Dispositivos Edge (On-Premise)

| Componente | Especificaciones | Ubicación |
|------------|------------------|-----------|
| **NanoPi Neo4** | ARM64, 1GB RAM, Ubuntu | Casa del adulto mayor |
| **Cámara IP Dahua** | Stream RTSP, H.264 | Casa del adulto mayor |

---

## 2. Esquema de Base de Datos

### 2.1 Diagrama Entidad-Relación

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              POSTGRESQL - vigilia-db-main                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────┐         ┌─────────────────────────┐                    │
│  │      usuarios       │         │    adultos_mayores      │                    │
│  ├─────────────────────┤         ├─────────────────────────┤                    │
│  │ id (PK)             │◄───┐    │ id (PK)                 │                    │
│  │ firebase_uid (UQ)   │    │    │ usuario_id (FK,UQ) ─────┼──┐                 │
│  │ nombre              │    │    │ nombre_completo         │  │                 │
│  │ email (UQ)          │    │    │ fecha_nacimiento        │  │                 │
│  │ hash_contrasena     │    │    │ direccion               │  │                 │
│  │ rol                 │    │    │ notas_relevantes        │  │                 │
│  │ push_token          │    │    │ token_fcm_app_adulto    │  │                 │
│  │ fecha_creacion      │    │    │ fecha_registro          │  │                 │
│  └──────────┬──────────┘    │    └───────────┬─────────────┘  │                 │
│             │               │                │                │                 │
│             ▼               │                ▼                │                 │
│  ┌─────────────────────────┐│    ┌─────────────────────────┐  │                 │
│  │ cuidadores_adultos_     ││    │      dispositivos       │  │                 │
│  │      mayores            ││    ├─────────────────────────┤  │                 │
│  ├─────────────────────────┤│    │ id (PK)                 │  │                 │
│  │ usuario_id (PK,FK) ─────┼┘    │ adulto_mayor_id (FK) ───┼──┼────┐            │
│  │ adulto_mayor_id (PK,FK)─┼────►│ nombre_dispositivo      │  │    │            │
│  │ rol_cuidador            │     │ identificador_hw (UQ)   │  │    │            │
│  └─────────────────────────┘     │ ubicacion               │  │    │            │
│             │                    │ ip_camara_local         │  │    │            │
│             │                    │ estado                  │  │    │            │
│             │                    │ version_software        │  │    │            │
│             │                    │ usuario_camara          │  │    │            │
│             │                    │ contrasena_camara_enc   │  │    │            │
│             │                    │ fecha_configuracion     │  │    │            │
│             │                    └─────────────────────────┘  │    │            │
│             │                                                 │    │            │
│             ▼                                                 │    │            │
│  ┌─────────────────────────┐     ┌─────────────────────────┐  │    │            │
│  │ configuraciones_alerta  │     │        alertas          │◄─┼────┘            │
│  ├─────────────────────────┤     ├─────────────────────────┤  │                 │
│  │ id (PK)                 │     │ id (PK)                 │  │                 │
│  │ usuario_id (FK,UQ) ─────┼──┐  │ adulto_mayor_id (FK) ───┼──┘                 │
│  │ notificar_app           │  │  │ tipo_alerta             │                    │
│  │ token_fcm_app           │  │  │ timestamp_alerta        │                    │
│  │ notificar_whatsapp      │  │  │ dispositivo_id (FK)     │                    │
│  │ numero_whatsapp         │  │  │ url_video_almacenado    │                    │
│  │ notificar_email         │  │  │ confirmado_por_cuidador │                    │
│  │ email_secundario        │  │  │ notas                   │                    │
│  │ ultima_modificacion     │  │  │ detalles_adicionales    │                    │
│  └─────────────────────────┘  │  │ fecha_registro          │                    │
│                               │  └───────────┬─────────────┘                    │
│                               │              │                                  │
│  ┌─────────────────────────┐  │              │                                  │
│  │    alertas_vistas       │◄─┼──────────────┤                                  │
│  ├─────────────────────────┤  │              │                                  │
│  │ id (PK)                 │  │              │                                  │
│  │ usuario_id (FK) ────────┼──┘              │                                  │
│  │ alerta_id (FK) ─────────┼─────────────────┘                                  │
│  │ recordatorio_id (FK) ───┼───────────────────────────────────┐                │
│  │ fecha_vista             │                                   │                │
│  └─────────────────────────┘                                   │                │
│                                                                │                │
│  ┌─────────────────────────┐     ┌─────────────────────────┐   │                │
│  │   solicitudes_cuidado   │     │     recordatorios       │◄──┘                │
│  ├─────────────────────────┤     ├─────────────────────────┤                    │
│  │ id (PK)                 │     │ id (PK)                 │                    │
│  │ cuidador_id (FK)        │     │ adulto_mayor_id (FK)    │                    │
│  │ email_destinatario      │     │ titulo                  │                    │
│  │ usuario_destinat. (FK)  │     │ descripcion             │                    │
│  │ estado                  │     │ fecha_hora_programada   │                    │
│  │ mensaje                 │     │ frecuencia              │                    │
│  │ fecha_solicitud         │     │ tipo_recordatorio       │                    │
│  │ fecha_respuesta         │     │ dias_semana[]           │                    │
│  └─────────────────────────┘     │ estado                  │                    │
│                                  │ fecha_creacion          │                    │
│  ┌─────────────────────────┐     └─────────────────────────┘                    │
│  │     suscripciones       │                                                    │
│  ├─────────────────────────┤                                                    │
│  │ id (PK)                 │                                                    │
│  │ usuario_id (FK)         │                                                    │
│  │ nombre_plan             │                                                    │
│  │ estado_suscripcion      │                                                    │
│  │ fecha_inicio            │                                                    │
│  │ fecha_fin               │                                                    │
│  │ fecha_ultimo_pago       │                                                    │
│  │ id_pago_externo         │                                                    │
│  └─────────────────────────┘                                                    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Descripción de Tablas

| # | Tabla | Propósito |
|---|-------|-----------|
| 1 | `usuarios` | Cuentas de usuario con roles: cuidador, administrador, adulto_mayor |
| 2 | `adultos_mayores` | Perfiles de personas monitoreadas (puede o no tener cuenta) |
| 3 | `cuidadores_adultos_mayores` | Relación N:N entre cuidadores y adultos mayores |
| 4 | `dispositivos` | NanoPi edge devices con configuración de cámara |
| 5 | `configuraciones_alerta` | Preferencias de notificación por usuario |
| 6 | `alertas` | Eventos de caída (tipo='caida') y solicitudes de ayuda (tipo='ayuda') |
| 7 | `alertas_vistas` | Estado de lectura de alertas/recordatorios por usuario |
| 8 | `recordatorios` | Medicamentos, citas médicas, ejercicio, hidratación, etc. |
| 9 | `suscripciones` | Planes de pago (básico, plus, premium) |
| 10 | `solicitudes_cuidado` | Invitaciones de cuidado entre usuarios |

### 2.3 Tipos Enumerados (CHECK Constraints)

```sql
-- usuarios.rol
CHECK (rol IN ('cuidador', 'administrador', 'adulto_mayor'))

-- dispositivos.estado
CHECK (estado IN ('activo', 'inactivo', 'mantenimiento', 'error'))

-- alertas.tipo_alerta
CHECK (tipo_alerta IN ('caida', 'ayuda'))

-- recordatorios.frecuencia
CHECK (frecuencia IN ('una_vez', 'diario', 'semanal', 'mensual'))

-- recordatorios.tipo_recordatorio
CHECK (tipo_recordatorio IN ('medicamento', 'cita_medica', 'ejercicio',
                              'hidratacion', 'comida', 'consejo_salud', 'otro'))

-- recordatorios.estado
CHECK (estado IN ('pendiente', 'enviado', 'confirmado', 'omitido'))

-- suscripciones.nombre_plan
CHECK (nombre_plan IN ('basico', 'plus', 'premium'))

-- suscripciones.estado_suscripcion
CHECK (estado_suscripcion IN ('activa', 'pendiente_pago', 'cancelada', 'finalizada'))

-- solicitudes_cuidado.estado
CHECK (estado IN ('pendiente', 'aceptada', 'rechazada'))
```

---

## 3. Diagrama de Flujo de Datos

### 3.1 Arquitectura General

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                                USUARIOS FINALES                                   │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌─────────────────┐              ┌─────────────────┐                           │
│   │   App Móvil     │              │    Web App      │                           │
│   │  (Expo/RN)      │              │ (React Native)  │                           │
│   │                 │              │                 │                           │
│   │  Android/iOS    │              │ app-vigilia.cl  │                           │
│   └────────┬────────┘              └────────┬────────┘                           │
│            │                                │                                     │
│            └────────────┬───────────────────┘                                     │
│                         │                                                         │
│                         ▼                                                         │
│            ┌────────────────────────┐                                             │
│            │    Firebase Auth       │                                             │
│            │  (Autenticación)       │                                             │
│            └───────────┬────────────┘                                             │
│                        │ JWT Token                                                │
│                        ▼                                                          │
├──────────────────────────────────────────────────────────────────────────────────┤
│                           GOOGLE CLOUD PLATFORM                                   │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                            CLOUD RUN                                     │    │
│   │                                                                          │    │
│   │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                 │    │
│   │  │              │   │              │   │              │                 │    │
│   │  │ api-backend  │◄──┤   alertas-   │   │  api-email   │                 │    │
│   │  │  (FastAPI)   │   │  websocket   │   │ (SendGrid)   │                 │    │
│   │  │              │   │              │   │              │                 │    │
│   │  └──────┬───────┘   └──────────────┘   └──────┬───────┘                 │    │
│   │         │                                      │                         │    │
│   │         │           ┌──────────────┐          │                         │    │
│   │         │           │  whatsapp-   │          │                         │    │
│   │         ├──────────►│   webhook    │◄─────────┤                         │    │
│   │         │           │  (Meta API)  │          │                         │    │
│   │         │           └──────────────┘          │                         │    │
│   │         │                                      │                         │    │
│   └─────────┼──────────────────────────────────────┼─────────────────────────┘    │
│             │                                      │                              │
│             ▼                                      ▼                              │
│   ┌──────────────────┐                  ┌──────────────────────┐                 │
│   │                  │                  │                      │                 │
│   │    CLOUD SQL     │                  │  SERVICIOS EXTERNOS  │                 │
│   │   (PostgreSQL)   │                  │                      │                 │
│   │                  │                  │  - SendGrid (Email)  │                 │
│   │ vigilia-db-main  │                  │  - Meta WhatsApp API │                 │
│   │                  │                  │  - Expo Push Notif.  │                 │
│   └──────────────────┘                  └──────────────────────┘                 │
│                                                                                   │
│   ┌──────────────────┐                  ┌──────────────────┐                     │
│   │                  │                  │                  │                     │
│   │  CLOUD STORAGE   │                  │  SECRET MANAGER  │                     │
│   │                  │                  │                  │                     │
│   │ nanopi-videos-   │                  │  - DB Password   │                     │
│   │     input        │                  │  - API Keys      │                     │
│   │                  │                  │  - Tokens        │                     │
│   └────────▲─────────┘                  └──────────────────┘                     │
│            │                                                                      │
├────────────┼─────────────────────────────────────────────────────────────────────┤
│            │                    ON-PREMISE (Casa Adulto Mayor)                    │
├────────────┼─────────────────────────────────────────────────────────────────────┤
│            │                                                                      │
│   ┌────────┴─────────┐         ┌─────────────────┐                               │
│   │                  │  RTSP   │                 │                               │
│   │   NanoPi Neo4    │◄────────│  Cámara Dahua   │                               │
│   │                  │         │   (IP Camera)   │                               │
│   │  - MediaPipe     │         │                 │                               │
│   │  - Detección IA  │         └─────────────────┘                               │
│   │  - Python 3.x    │                                                           │
│   │                  │                                                           │
│   └──────────────────┘                                                           │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Flujo de Detección de Caída

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        FLUJO: DETECCIÓN DE CAÍDA                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │   Cámara     │
     │    Dahua     │
     └──────┬───────┘
            │ Stream RTSP
            ▼
     ┌──────────────┐
     │  NanoPi Neo4 │
     │              │
     │  MediaPipe   │──────► Análisis de pose en tiempo real
     │  Fall Detect │
     └──────┬───────┘
            │
            │ Caída Detectada?
            │
     ┌──────┴──────┐
     │             │
    NO            SÍ
     │             │
     ▼             ▼
  Continuar   ┌────────────┐
  monitoreo   │  Capturar  │
              │  Snapshot  │
              └─────┬──────┘
                    │
                    ▼
              ┌────────────┐
              │  Subir a   │
              │  Cloud     │───────► gs://nanopi-videos-input/
              │  Storage   │
              └─────┬──────┘
                    │
                    ▼
              ┌────────────┐
              │ POST       │
              │ /internal/ │───────► api-backend
              │ alerta     │
              └─────┬──────┘
                    │
                    ▼
              ┌────────────┐
              │ Guardar en │
              │ PostgreSQL │───────► tabla: alertas
              │            │
              └─────┬──────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ WebSocket│ │  Push   │ │WhatsApp │
   │ (tiempo │ │  Notif  │ │  Msg    │
   │  real)  │ │ (Expo)  │ │ (Meta)  │
   └────┬────┘ └────┬────┘ └────┬────┘
        │           │           │
        └───────────┼───────────┘
                    │
                    ▼
              ┌────────────┐
              │  Cuidador  │
              │  Recibe    │
              │  Alerta    │
              └─────┬──────┘
                    │
                    ▼
              ┌────────────┐
              │ "Ya Voy"   │───────► confirmado_por_cuidador = true
              │  Botón     │
              └────────────┘
```

### 3.3 Flujo de Solicitud de Ayuda

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        FLUJO: SOLICITUD DE AYUDA                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │ Adulto Mayor │
     │   (App)      │
     └──────┬───────┘
            │
            │ Presiona botón de ayuda
            ▼
     ┌──────────────┐
     │ POST         │
     │ /alertas/    │───────► api-backend
     │ ayuda        │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Guardar en   │
     │ PostgreSQL   │───────► tabla: alertas (tipo='ayuda')
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Buscar       │
     │ cuidadores   │───────► cuidadores_adultos_mayores
     │ vinculados   │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Obtener      │
     │ preferencias │───────► configuraciones_alerta
     │ notificación │
     └──────┬───────┘
            │
    ┌───────┴───────────────────┐
    │                           │
    ▼                           ▼
┌─────────┐   ┌─────────┐   ┌─────────┐
│ App     │   │ Email   │   │WhatsApp │
│ Push    │   │SendGrid │   │  Meta   │
└────┬────┘   └────┬────┘   └────┬────┘
     │             │             │
     └─────────────┼─────────────┘
                   │
                   ▼
            ┌────────────┐
            │  Cuidador  │
            │  Responde  │
            └────────────┘
```

### 3.4 Flujo de Recordatorios

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        FLUJO: RECORDATORIOS                                      │
└─────────────────────────────────────────────────────────────────────────────────┘

     ┌──────────────┐
     │  Cuidador    │
     │  Crea        │
     │ Recordatorio │
     └──────┬───────┘
            │
            │ POST /recordatorios
            ▼
     ┌──────────────┐
     │ Guardar en   │
     │ PostgreSQL   │───────► tabla: recordatorios
     └──────┬───────┘
            │
            │ Cuando llega la hora programada
            ▼
     ┌──────────────┐
     │ Cloud        │
     │ Scheduler    │───────► Trigger (cada minuto)
     │ (futuro)     │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Buscar       │
     │ recordatorios│───────► WHERE fecha_hora_programada <= NOW()
     │ pendientes   │              AND estado = 'pendiente'
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Enviar Push  │
     │ al adulto    │───────► token_fcm_app_adulto
     │ mayor        │
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Actualizar   │
     │ estado =     │───────► 'enviado'
     │ 'enviado'    │
     └──────────────┘
```

---

## 4. Servicios Externos

### 4.1 Integraciones

| Servicio | Proveedor | Uso en VigilIA |
|----------|-----------|----------------|
| **WhatsApp Business API** | Meta | Envío de alertas por WhatsApp a cuidadores |
| **SendGrid** | Twilio | Envío de emails de notificación |
| **Expo Push Notifications** | Expo | Notificaciones push a dispositivos móviles |
| **Firebase Authentication** | Google | Autenticación de usuarios |

### 4.2 Flujo de Autenticación

```
Usuario ──► Firebase Auth ──► JWT Token ──► api-backend ──► Validación
```

---

## 5. Seguridad

### 5.1 Gestión de Secretos

Todos los secretos sensibles se almacenan en **Google Secret Manager**:

- Contraseñas de base de datos
- API keys de servicios externos
- Tokens de autenticación

### 5.2 Comunicación

- **HTTPS** en todos los endpoints públicos
- **WebSocket Secure (WSS)** para conexiones en tiempo real
- **Internal API Key** para comunicación entre servicios

### 5.3 Base de Datos

- Conexión vía **Cloud SQL Auth Proxy** (Unix sockets)
- Usuario con permisos mínimos necesarios
- Contraseñas encriptadas para credenciales de cámaras

---

## 6. Escalabilidad

### 6.1 Cloud Run

- **Autoescalado**: 0 a N instancias según demanda
- **Concurrencia**: Múltiples requests por instancia
- **Cold starts**: Minimizados con configuración de instancias mínimas

### 6.2 Cloud SQL

- **Tier actual**: db-custom-2-8192 (2 vCPU, 8GB RAM)
- **Escalado vertical**: Posible aumentar recursos según demanda
- **Read replicas**: Disponible si se requiere

---

## 7. Monitoreo

### 7.1 Logging

```bash
# Ver logs de api-backend
gcloud run services logs tail api-backend --region=southamerica-west1

# Ver logs de todos los servicios
gcloud logging read "resource.type=cloud_run_revision"
```

### 7.2 Métricas

- Cloud Run: Latencia, requests, errores
- Cloud SQL: Conexiones, CPU, memoria
- Cloud Storage: Operaciones, almacenamiento

---

## 8. Comandos Útiles

### 8.1 Despliegue

```bash
# Frontend (Firebase Hosting)
cd frontend-vigilia && npx expo export -p web && firebase deploy --only hosting

# Backend (Cloud Run)
cd servicios/api-backend && powershell -ExecutionPolicy Bypass -File deploy-api-backend.ps1
```

### 8.2 Base de Datos

```bash
# Conectar a Cloud SQL
gcloud sql connect vigilia-db-main --user=postgres --project=composed-apogee-475623-p6

# Ver secreto de contraseña
gcloud secrets versions access latest --secret=vigilia-db-password
```

### 8.3 Logs

```bash
# Logs en tiempo real
gcloud run services logs tail api-backend --region=southamerica-west1
```

---

*Documento generado: Noviembre 2025*
*Proyecto: VigilIA - Sistema de Monitoreo Inteligente*
