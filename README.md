# VigilIA - Sistema Inteligente de Monitoreo para Adultos Mayores

Sistema de monitoreo y asistencia para adultos mayores que utiliza inteligencia artificial para detectar caídas en tiempo real y notificar a los cuidadores a través de múltiples canales.

## El Problema

Los adultos mayores que viven solos o con supervisión limitada enfrentan riesgos significativos:

- **Caídas no detectadas**: Una caída puede pasar desapercibida por horas, aumentando el riesgo de complicaciones
- **Tiempo de respuesta lento**: Sin un sistema de alerta, el tiempo entre el incidente y la ayuda puede ser crítico
- **Dependencia de botones de pánico**: Requieren que la persona esté consciente y pueda activarlos
- **Falta de comunicación**: Los cuidadores no tienen visibilidad del estado de sus seres queridos

## La Solución

VigilIA implementa un sistema integral que combina:

1. **Detección automática de caídas con IA**: Cámaras con procesamiento edge que detectan caídas sin intervención humana
2. **Notificaciones multi-canal**: Alertas instantáneas vía Push, WhatsApp y Email
3. **Respuesta en tiempo real**: Los cuidadores pueden confirmar que van en camino con un solo toque
4. **Recordatorios de salud**: Medicamentos, citas médicas, hidratación y más

---

## Arquitectura del Sistema

```
+------------------+     RTSP      +------------------+
|   Cámara Dahua   |-------------->|    NanoPi Neo4   |
|   (Visión IP)    |               | (IA Edge Local)  |
+------------------+               +--------+---------+
                                            |
                                            | Detecta caída
                                            v
+------------------+               +------------------+
|  Cloud Storage   |<--------------|  Snapshot + POST |
| (nanopi-videos)  |               |  /internal/alerta|
+------------------+               +--------+---------+
                                            |
                    +-----------------------+
                    v
+-------------------+------------------+-------------------+
|                   |                  |                   |
v                   v                  v                   v
+-----------+  +-----------+  +----------------+  +----------------+
|  api-     |  | alertas-  |  |   api-email    |  |  webhook-wsp   |
|  backend  |  | websocket |  |   (SendGrid)   |  |  (WhatsApp)    |
+-----------+  +-----------+  +----------------+  +----------------+
     |              |                  |                   |
     v              v                  v                   v
+-----------+  +-----------+  +----------------+  +----------------+
| PostgreSQL|  | WebSocket |  |     Email      |  |    WhatsApp    |
| Cloud SQL |  | Real-time |  |   Cuidadores   |  |   Cuidadores   |
+-----------+  +-----------+  +----------------+  +----------------+
                    |
                    v
         +--------------------+
         |   App Móvil/Web    |
         |  (React Native)    |
         +--------------------+
                    |
                    v
         +--------------------+
         |     Cuidador       |
         |   "YA VOY" -->     |
         +--------------------+
```

---

## Tecnologías Utilizadas

### Backend (Microservicios en Cloud Run)

| Servicio | Tecnología | Función |
|----------|------------|---------|
| **api-backend** | FastAPI + PostgreSQL | API REST principal |
| **alertas-websocket** | FastAPI + WebSocket | Notificaciones tiempo real |
| **api-email** | FastAPI + SendGrid | Envío de emails |
| **webhook-wsp** | FastAPI + Meta API | Alertas por WhatsApp |

### Frontend

| Plataforma | Tecnología |
|------------|------------|
| **Móvil** | React Native + Expo |
| **Web** | React Native Web |
| **Hosting** | Firebase Hosting |

### Edge Computing (IoT)

| Componente | Tecnología |
|------------|------------|
| **Hardware** | NanoPi Neo4 (ARM64) |
| **IA** | MediaPipe BlazePose Lite |
| **Visión** | OpenCV + RTSP |
| **Cámara** | Dahua IP (1080p, IR) |

### Infraestructura GCP

| Servicio | Uso |
|----------|-----|
| **Cloud Run** | Microservicios containerizados |
| **Cloud SQL** | PostgreSQL 17 |
| **Cloud Storage** | Snapshots de caídas |
| **Secret Manager** | Credenciales seguras |
| **Firebase** | Auth + Hosting |

---

## Estructura del Proyecto

```
Capstone/
├── VigiliaCode/
│   ├── frontend-vigilia/          # App React Native (Expo)
│   │   ├── app/
│   │   │   ├── (auth)/            # Login, registro
│   │   │   └── (app)/
│   │   │       ├── cuidador/      # Panel cuidador
│   │   │       │   ├── alertas.tsx
│   │   │       │   ├── recordatorios.tsx
│   │   │       │   └── adultos-mayores/
│   │   │       └── index.tsx      # Dashboard principal
│   │   ├── contexts/              # Auth, Toast, Notifications
│   │   └── package.json
│   │
│   └── servicios/
│       ├── api-backend/           # API REST principal
│       │   ├── main.py            # FastAPI (3600+ líneas)
│       │   ├── Dockerfile
│       │   └── deploy-api-backend.ps1
│       │
│       ├── alertas-websocket/     # Notificaciones real-time
│       │   └── main.py
│       │
│       ├── api-email/             # Servicio de emails
│       │   └── main.py
│       │
│       ├── webhook-wsp/           # Integración WhatsApp
│       │   └── main.py
│       │
│       └── nanopi/                # Código edge device
│           └── fall_detection_edge.py
│
├── docs/                          # Documentación técnica
├── Fase 1-3/                      # Evidencias académicas
└── README.md                      # Este archivo
```

---

## Flujos Principales

### 1. Detección Automática de Caídas

```
1. Cámara RTSP transmite video continuamente
2. NanoPi procesa frames con MediaPipe (6-7 FPS)
3. Algoritmo detecta postura de caída:
   - Inclinación torso > 50 grados
   - Cadera por debajo del 70% de altura
   - Relación ancho/alto > 1.5 (acostado)
4. Si se confirma caída (3 frames consecutivos):
   - Captura snapshot
   - Sube a Cloud Storage
   - Notifica al backend
5. Backend procesa alerta:
   - Guarda en PostgreSQL
   - Obtiene cuidadores vinculados
   - Consulta preferencias de notificación
   - Envía Push, Email y/o WhatsApp
6. Cuidador recibe alerta y presiona "YA VOY"
7. Adulto mayor ve confirmación: "Ayuda en camino"
```

### 2. Solicitud Manual de Ayuda

```
1. Adulto mayor presiona botón de ayuda en app
2. POST /alertas (tipo='ayuda')
3. Sistema notifica a todos los cuidadores vinculados
4. Cuidadores responden con "YA VOY"
```

### 3. Recordatorios de Salud

```
1. Cuidador crea recordatorio (medicamento, cita, etc.)
2. Sistema programa notificación
3. A la hora indicada, envía Push al adulto mayor
4. Recordatorio aparece en dashboard de ambos
```

---

## Equipo de Desarrollo

Proyecto Capstone desarrollado para monitoreo y asistencia de adultos mayores.

**Región**: Santiago, Chile

**Proyecto GCP**: composed-apogee-475623-p6

---

## Licencia

Proyecto académico - Todos los derechos reservados.
