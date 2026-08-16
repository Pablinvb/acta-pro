# Workflows de n8n (histórico)

Aquí están los 17 workflows + el manejador de errores con los que arrancó ACTA
PRO. **Ya no se ejecutan.** La lógica vive ahora en `web/src/services/`.

Se conservan a propósito y no se borran: son el registro de por qué el sistema
hace lo que hace. Varias reglas del producto nacieron aquí y siguen vigentes.

## Por qué se dejó n8n

La razón no fue estética. De los 88 nodos reales de estos archivos, **25 (un
28 %) eran `NoOp`**, y eran exactamente todas las operaciones de base de datos.
n8n no llegó a persistir nada.

En cuanto ACTA PRO tuviera su propia base de datos —y la necesita— habría dos
sistemas escribiendo sobre el mismo esquema sin una transacción compartida. Ese
es un problema de corrección, no de gusto: quien es dueño de los datos debe ser
dueño de la lógica que los toca.

Lo que sí aportaba n8n, y ha habido que rehacer, es la gestión de credenciales
OAuth de Google. Está en `web/src/services/google.client.ts`.

## Correspondencia

| Workflow | Servicio |
|---|---|
| 01 Calendar Meeting Intake | `calendar.service.ts` |
| 02 Runachay Student Lookup | `runachay.service.ts` |
| 03 Pre Meeting Record | `meeting.service.ts` |
| 04 Meeting Reminder | `email.service.ts` + `calendar.service.ts` |
| 05 Start Meeting | `meeting.service.ts` |
| 06 Meeting Transcription | `speech.service.ts` |
| 07 Speaker Identification | `speaker.service.ts` |
| 08 Meeting Intelligence | `meeting-ai.service.ts` |
| 09 Language & Documentation Review | `language-review.service.ts` |
| 10 Generate Meeting Minutes | `acta-generator.service.ts` |
| 11 Teacher Approval | `approval.service.ts` |
| 12 Digital Signatures | `signature.service.ts` |
| 13 Final Document | `document.service.ts` |
| 14 Archive Meeting | `storage.service.ts` |
| 15 Send Meeting Record | `email.service.ts` |
| 16 Follow Up | `calendar.service.ts` |
| 17 Audit Trail | `audit.service.ts` |
| Error Handler | `services/errors.ts` |
| Encadenado `Execute Workflow` | `meeting-lifecycle.service.ts` |

## Fallos del original que se corrigieron al portarlo

Merece la pena dejarlos anotados, porque el código nuevo se desvía del viejo a
conciencia en estos puntos:

1. **El acta repetía contenido.** El workflow 10 imprimía
   `situations_discussed` tanto en la sección 3 (Antecedentes) como en la 6
   (Situaciones analizadas). Ahora la 3 usa un campo propio, `background`.

2. **Se descartaba parte del análisis.** `teacher_actions` y
   `representative_concerns` los producía el workflow 08 y no aparecían en
   ninguna sección del acta. Ahora alimentan la sección 5 (Intervenciones
   relevantes), que es justo lo que describen.

3. **Se podía aprobar un acta con fragmentos RED sin resolver.** El workflow 09
   los clasificaba y el 11 aprobaba sin consultarlos. Ahora `approval.service`
   se niega a aprobar mientras quede alguno sin decisión explícita, y lo hace en
   el servidor, no solo en la pantalla.

4. **No se validaba la respuesta del modelo.** El workflow 08 hacía `JSON.parse`
   y confiaba. Un modelo puede devolver JSON válido con la forma equivocada.
   Ahora la respuesta pasa por un esquema y, si no encaja, falla en voz alta en
   lugar de producir un acta incompleta en silencio.

## Reglas que se conservaron intactas

- Ante un fallo de integración **no se elimina la reunión ni nada ya procesado**;
  se marca `retry_required`.
- **La IA solo sugiere.** Nunca modifica el acta sin decisión de la docente.
- **La transcripción se almacena separada del acta**, con permisos propios, y
  nunca se adjunta a un correo.
- El borrador **no se convierte en acta final por su cuenta**.
