# ACTA PRO — Arquitectura del sistema (MVP)

## Objetivo general

Automatizar todo el ciclo de una reunión escolar:

```
Runachay → Google Calendar → preparación automática del acta → reunión →
transcripción → identificación de participantes → análisis con IA →
generación profesional del acta → revisión docente → firmas →
almacenamiento → clasificación por estudiante → envío al representante →
seguimiento
```

El sistema está diseñado de forma modular para conectarse posteriormente con una aplicación web/móvil frontend llamada **ACTA PRO**.

## Principios clave

- Automatización inteligente
- Protección docente
- Trazabilidad completa
- Integración segura
- Privacidad y cumplimiento (privacidad por diseño, LOPDP)

## Workflows del sistema

| # | Workflow | Función | En este repo |
|---|----------|---------|:---:|
| 01 | Calendar Meeting Intake | Detecta reuniones ACTA PRO en Google Calendar del docente, normaliza los datos y evita duplicados | ✅ |
| 02 | Runachay Student Lookup | Consulta estudiante/representante/docente en Runachay (placeholder de API externa) | ✅ |
| 03 | Pre Meeting Record | Genera el registro preliminar de la reunión (`status: scheduled`) en base de datos | — |
| 04 | Meeting Reminder | Alerta al docente 30 min antes de la reunión | — |
| 05 | Start Meeting | Webhook de inicio de reunión desde la app; participantes presentes | ✅ |
| 06 | Meeting Transcription | Recibe audio incremental y lo transcribe (Speech-to-Text) | ✅ |
| 07 | Speaker Identification | Diarización de hablantes (placeholder — requiere servicio dedicado) | — |
| 08 | Meeting Intelligence | Analiza la transcripción con un LLM y devuelve JSON estructurado | ✅ |
| 09 | Language & Documentation Review | Detecta juicios de valor, lenguaje riesgoso, etc. (GREEN/YELLOW/RED) | ✅ |
| 10 | Generate Meeting Minutes | Genera el borrador del acta con las 13 secciones | ✅ |
| 11 | Teacher Approval | El docente aprueba, edita o rechaza el borrador | ✅ |
| 12 | Digital Signatures | Recibe firmas del docente y representante | — |
| 13 | Final Document | Genera el documento final (HTML / Google Docs / PDF) | — |
| 14 | Archive Meeting | Archiva el acta y la transcripción en Google Drive | ✅ |
| 15 | Send Meeting Record | Envía el acta firmada al representante por Gmail | ✅ |
| 16 | Follow Up | Crea eventos de seguimiento en Calendar tras aprobación docente | — |
| 17 | Audit Trail | Registra todos los eventos críticos del sistema | — |
| — | Error Handler | Manejador central de errores para todos los workflows críticos | ✅ |

Los workflows marcados "—" pertenecen a fases posteriores del roadmap (ver más abajo) y no forman parte de la cadena mínima de Fase 1.

## Reglas de la IA (Workflow 08 — Meeting Intelligence)

El modelo debe devolver **exclusivamente JSON estructurado** con estos campos:

```json
{
  "meeting_reason": "",
  "topics": [],
  "situations_discussed": [],
  "teacher_actions": [],
  "representative_concerns": [],
  "student_interventions": [],
  "agreements": [],
  "commitments": [],
  "responsible_people": [],
  "evidence_mentions": [],
  "follow_up_actions": [],
  "follow_up_date": null,
  "language_risk_flags": []
}
```

Reglas obligatorias:

1. No inventar información.
2. No determinar quién tiene la razón.
3. No emitir diagnósticos.
4. No emitir juicios personales.
5. Diferenciar claramente hechos, declaraciones y acuerdos.
6. Todo acuerdo debe poder rastrearse a la transcripción.
7. Si existe incertidumbre, marcar `requires_teacher_review = true`.

## Protección documental (Workflow 09)

Cada fragmento de redacción se clasifica como:

- **GREEN** — adecuado.
- **YELLOW** — requiere revisión.
- **RED** — no recomendado.

La IA **solo sugiere**; nunca modifica el contenido final en silencio. El docente debe aprobar los cambios.

## Estructura del acta final (Workflow 10)

1. Datos generales
2. Motivo de la reunión
3. Antecedentes relevantes
4. Temas tratados
5. Intervenciones relevantes
6. Situaciones analizadas
7. Acuerdos
8. Compromisos
9. Responsables
10. Evidencias mencionadas
11. Fecha o acciones de seguimiento
12. Observaciones
13. Firmas

Lenguaje: objetivo, profesional, institucional, descriptivo, neutral.

## Estructura de datos principal

`TEACHERS`, `STUDENTS`, `REPRESENTATIVES`, `MEETINGS`, `PARTICIPANTS`, `TRANSCRIPT_SEGMENTS`, `AGREEMENTS`, `EVIDENCE`, `DOCUMENTS`, `SIGNATURES`, `FOLLOW_UPS`, `AUDIT_LOGS`.

## Repositorio en Google Drive (Workflow 14)

```
ACTA PRO/
  Docentes/
    {{teacher_name}}/
      {{student_name}}/
        {{school_year}}/
          {{meeting_date}} - {{meeting_type}}
```

Cada estudiante tiene su propio historial. La transcripción completa se guarda en una **ubicación separada y con acceso restringido**, nunca junto a las actas.

Código único del acta: `ACTA-YYYY-ESTUDIANTE-SECUENCIA`.

## Seguridad

- Privacidad por diseño.
- Ninguna clave directamente en los nodos — se usan **n8n Credentials**.
- Separación de datos sensibles y datos operativos.
- Autenticación, autorización, HTTPS, control de acceso, logs de auditoría, minimización de datos, manejo de errores, reintentos controlados.
- No se envía información de estudiantes a servicios externos que no estén expresamente configurados.

## Manejo de errores

Workflow central `ACTA PRO | Error Handler`, configurado como *Error Workflow* en cada workflow crítico. Registra: workflow, node, meeting_id, error, timestamp.

Si falla una integración externa:
- **NO** se elimina la reunión.
- **NO** se elimina información ya procesada.
- Se marca `processing_status = retry_required`.

## Credenciales necesarias

| Credencial | Usada en |
|---|---|
| Google Calendar OAuth2 | 01 |
| Google Drive OAuth2 | 14 |
| Gmail OAuth2 | 15 |
| OpenAI API Key (`httpHeaderAuth`) | 06 (Whisper), 08, 09 |
| Runachay API Key (`httpHeaderAuth`) + variables `RUNACHAY_API_URL`, `RUNACHAY_STUDENT_ENDPOINT`, `RUNACHAY_REPRESENTATIVE_ENDPOINT` | 02 |
| Base de datos (Postgres recomendado; Google Sheets como fallback temporal) | 03, 05, 06, 11, 14, 15, 17 (placeholders `NoOp` en el MVP) |

## Qué se puede probar sin Runachay

Workflows 01 (con `data_status = manual_verification_required` si faltan datos), 05, 06 (recepción de audio) y 10/11 (generación y aprobación del borrador).

## Datos ficticios de prueba

Ver [`docs/DATOS_DE_PRUEBA.md`](DATOS_DE_PRUEBA.md).

## Roadmap por fases

- **Fase 1** (este repo): Google Calendar → datos de reunión → Webhook → transcripción → IA → borrador → aprobación docente → Google Drive → Gmail.
- **Fase 2**: Runachay API real.
- **Fase 3**: diarización avanzada de hablantes.
- **Fase 4**: firma digital avanzada.
- **Fase 5**: repositorio institucional y panel administrativo.
