# Datos ficticios de prueba — ACTA PRO MVP

Estos datos permiten ejecutar la cadena de la Fase 1 sin depender de Runachay ni de datos reales de estudiantes.

## Evento de Google Calendar (workflow 01)

```
Título: Reunión con Representante - [ACTA PRO]
Descripción:
Estudiante: Juan Pérez López
Representante: María López
maria.lopez@email.com
```

## Webhook `/acta-pro/start-meeting` (workflow 05)

```json
{
  "meeting_id": "ACTA-2026-0001",
  "teacher_id": "T-045",
  "student_id": "S-0231",
  "participants": [
    { "role": "teacher", "name": "Ana Pérez" },
    { "role": "mother", "name": "María López" },
    { "role": "student", "name": "Juan Pérez" }
  ]
}
```

## Webhook `/acta-pro/audio-chunk` (workflow 06)

```json
{
  "meeting_id": "ACTA-2026-0001",
  "timestamp": "2026-08-13T10:02:18Z",
  "participantes_esperados": ["Ana Pérez", "María López", "Juan Pérez"]
}
```

(adjuntar un archivo de audio corto como binary en el campo `data`)

## Entrada de prueba para workflow 08 (Meeting Intelligence)

Vía `Execute Workflow`:

```json
{
  "meeting_id": "ACTA-2026-0001",
  "full_transcript": "Docente: Buenos días, el objetivo de esta reunión es revisar el rendimiento académico de Juan. Madre: Estoy preocupada por las calificaciones de matemáticas. Docente: Propongo un plan de refuerzo semanal. Madre: De acuerdo, estaré pendiente."
}
```

## Webhook `/acta-pro/teacher-review` (workflow 11)

```json
{
  "meeting_id": "ACTA-2026-0001",
  "decision": "approve"
}
```
