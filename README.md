# ACTA PRO

**Agente inteligente para automatizar la gestión de reuniones entre docentes y representantes de estudiantes.**

ACTA PRO automatiza el ciclo completo de una reunión escolar: desde la detección de la cita en Google Calendar, pasando por la transcripción y el análisis de la conversación con IA, hasta la generación del acta, la aprobación docente, el almacenamiento y el envío al representante.

```
Runachay → Google Calendar → preparación del acta → reunión → transcripción →
identificación de participantes → análisis con IA → generación del acta →
revisión docente → firmas → almacenamiento → clasificación por estudiante →
envío al representante → seguimiento
```

## Estado del proyecto

🚧 **MVP — Fase 1.** Este repositorio contiene los workflows de n8n de la cadena mínima priorizada:

```
Google Calendar → datos de reunión → Webhook → transcripción → IA →
borrador del acta → aprobación docente → Google Drive → Gmail
```

Los workflows se entregan **desactivados** (`active: false`) hasta validar credenciales y datos de prueba.

## Contenido del repositorio

```
acta-pro/
├── workflows/                          # Workflows n8n (JSON importable)
│   ├── ACTA_PRO_01_Calendar_Meeting_Intake.json
│   ├── ACTA_PRO_02_Runachay_Student_Lookup.json
│   ├── ACTA_PRO_05_Start_Meeting.json
│   ├── ACTA_PRO_06_Meeting_Transcription.json
│   ├── ACTA_PRO_08_Meeting_Intelligence.json
│   ├── ACTA_PRO_09_Language_Documentation_Review.json
│   ├── ACTA_PRO_10_Generate_Meeting_Minutes.json
│   ├── ACTA_PRO_11_Teacher_Approval.json
│   ├── ACTA_PRO_14_Archive_Meeting.json
│   ├── ACTA_PRO_15_Send_Meeting_Record.json
│   └── ACTA_PRO_Error_Handler.json
├── web/                                # Web app (Next.js) que consume los workflows
├── design/                             # Prototipo de interfaz y notas de diseño
└── docs/
    └── ARQUITECTURA.md                 # Arquitectura completa del sistema (MVP)
```

## Interfaz

La web app vive en [`web/`](web/) y cubre las cinco pantallas de la Fase 1:
agenda, ficha previa, sala de reunión, revisión del acta y envío. Arranca en modo
demostración sin necesidad de n8n:

```bash
npm --prefix web install && npm --prefix web run dev
```

El diseño y el prototipo clickeable están en [`design/`](design/).

## Arquitectura

El sistema se organiza en 17 workflows modulares + un manejador de errores central. El detalle completo (roles, campos de datos, reglas de la IA, seguridad, fases del MVP) está en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

Integraciones externas contempladas: **Runachay** (plataforma institucional del colegio), **Google Calendar**, **Google Drive**, **Gmail**, un modelo de lenguaje (LLM) para análisis de reuniones y un servicio de Speech-to-Text.

## Cómo importar los workflows

1. En tu instancia de n8n: `Workflows → Import from File`.
2. Selecciona cada `.json` de la carpeta `workflows/`.
3. Cada workflow incluye **Sticky Notes** explicando su función y qué credenciales configurar.
4. Revisa la sección "Credenciales necesarias" en `docs/ARQUITECTURA.md` antes de activarlos.

## Seguridad y privacidad

- Ningún nodo trae credenciales, tokens ni endpoints reales embebidos — todos los servicios externos están marcados como `CONFIGURAR - [servicio]`.
- La transcripción completa se almacena separada del acta final, en una ubicación con acceso restringido.
- El manejo de errores nunca elimina una reunión ni datos ya procesados; solo marca `processing_status = retry_required`.
- Principio de privacidad por diseño: minimización de datos, autenticación vía n8n Credentials, control de acceso y logs de auditoría.

## Roadmap

- **Fase 1** ✅ (este repo): Calendar → Webhook → transcripción → IA → borrador → aprobación docente → Drive → Gmail.
- **Fase 2**: integración real con la API de Runachay.
- **Fase 3**: diarización avanzada de hablantes.
- **Fase 4**: firma digital avanzada.
- **Fase 5**: repositorio institucional y panel administrativo + frontend web/móvil ACTA PRO.

## Licencia

Sin licencia definida todavía.
