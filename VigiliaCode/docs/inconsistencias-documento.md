# Inconsistencias: Documento Tesis vs Proyecto Actual

## Resumen
Este documento lista las diferencias encontradas entre la seccion "Diagrama de Despliegue" del documento de tesis (Base capstone 2.docx) y el estado actual del proyecto VigilIA.

---

## 1. Infraestructura de Computo

| Documento | Proyecto Actual | Accion |
|-----------|-----------------|--------|
| Menciona "Compute Engine" | Se usa **Cloud Run** (serverless) | CORREGIR - Cloud Run es la plataforma real |
| No especifica microservicios | 4 microservicios: api-backend, alertas-websocket, api-email, whatsapp-webhook | AGREGAR |

---

## 2. Servicios Firebase (FALTANTES en documento)

El documento NO menciona Firebase, pero el proyecto usa:

| Servicio | Uso | Estado en Doc |
|----------|-----|---------------|
| Firebase Hosting | Aloja la web app (app-vigilia.web.app) | FALTANTE |
| Firebase Authentication | Autenticacion de usuarios (JWT) | FALTANTE |

---

## 3. Base de Datos

| Documento | Proyecto Actual | Accion |
|-----------|-----------------|--------|
| No especifica version PostgreSQL | PostgreSQL 17 | ACTUALIZAR |
| No menciona cantidad de tablas | 10 tablas en produccion | AGREGAR |
| No lista las tablas | usuarios, adultos_mayores, cuidadores_adultos_mayores, dispositivos, configuraciones_alerta, alertas, alertas_vistas, recordatorios, suscripciones, solicitudes_cuidado | AGREGAR |

---

## 4. Almacenamiento

| Documento | Proyecto Actual | Accion |
|-----------|-----------------|--------|
| Menciona Cloud Storage genericamente | Bucket especifico: nanopi-videos-input | ESPECIFICAR |
| No menciona proposito | Almacena snapshots de caidas | AGREGAR |

---

## 5. Dispositivos Edge (FALTANTES en documento)

El documento NO menciona los dispositivos on-premise:

| Componente | Descripcion | Estado en Doc |
|------------|-------------|---------------|
| NanoPi Neo4 | SBC que ejecuta deteccion de caidas con MediaPipe | FALTANTE |
| Camara IP Dahua | Proporciona stream RTSP | FALTANTE |
| Procesamiento local | Video se procesa localmente, solo se envian alertas | FALTANTE |

---

## 6. Servicios de Notificaciones

| Documento | Proyecto Actual | Accion |
|-----------|-----------------|--------|
| Menciona notificaciones genericamente | 3 canales especificos: Email (SendGrid), WhatsApp (Meta API), Push (Expo) | ESPECIFICAR |
| No menciona WebSocket | alertas-websocket para tiempo real | AGREGAR |

---

## 7. Seguridad (FALTANTE en documento)

| Componente | Descripcion | Estado en Doc |
|------------|-------------|---------------|
| Secret Manager | Gestion de credenciales (6+ secretos) | FALTANTE |
| Secretos almacenados | vigilia-db-password, internal-api-key, SENDGRID_API_KEY, whatsapp-api-key, whatsapp-token, webhook-api-key, webhook-verify-token | FALTANTE |

---

## 8. Region y Proyecto

| Documento | Proyecto Actual | Accion |
|-----------|-----------------|--------|
| No especifica region | southamerica-west1 (Santiago, Chile) | AGREGAR |
| No menciona proyecto GCP | composed-apogee-475623-p6 | AGREGAR |

---

## 9. Microservicios Cloud Run (Detalle)

El documento no detalla los microservicios. Informacion actual:

### api-backend (FastAPI)
- **URL**: api-backend-687053793381.southamerica-west1.run.app
- **Funcion**: CRUD, logica de negocio, gestion de alertas
- **Estado en doc**: FALTANTE

### alertas-websocket
- **URL**: alertas-websocket-687053793381.southamerica-west1.run.app
- **Funcion**: Comunicacion tiempo real via WebSocket
- **Estado en doc**: FALTANTE

### api-email (SendGrid)
- **URL**: api-email-687053793381.southamerica-west1.run.app
- **Funcion**: Envio de emails transaccionales
- **Estado en doc**: FALTANTE

### whatsapp-webhook (Meta API)
- **URL**: whatsapp-webhook-687053793381.southamerica-west1.run.app
- **Funcion**: Integracion WhatsApp Business
- **Estado en doc**: FALTANTE

---

## 10. Frontend

| Documento | Proyecto Actual | Accion |
|-----------|-----------------|--------|
| No especifica tecnologia | React Native con Expo | AGREGAR |
| No menciona plataformas | Web + Android + iOS | AGREGAR |
| No menciona URL | app-vigilia.web.app / app.mivigilia.cl | AGREGAR |

---

## Resumen de Acciones

| Tipo | Cantidad |
|------|----------|
| Secciones FALTANTES | 5 (Firebase, Edge, Security, Microservicios, Frontend) |
| Datos a ACTUALIZAR | 3 (Compute Engine -> Cloud Run, version PostgreSQL, detalles storage) |
| Informacion a AGREGAR | 10+ items (tablas, secretos, URLs, etc.) |

---

## Recomendacion

El documento [docs/seccion-diagrama-despliegue-actualizado.docx](seccion-diagrama-despliegue-actualizado.docx) ya contiene toda esta informacion actualizada y puede reemplazar la seccion existente en el documento de tesis.

El diagrama actualizado se puede generar desde:
- [docs/diagrama-despliegue.html](diagrama-despliegue.html) - Abrir en navegador y capturar
- [docs/diagrama-despliegue.mmd](diagrama-despliegue.mmd) - Codigo fuente Mermaid
