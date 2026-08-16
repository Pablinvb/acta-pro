# ACTA PRO — Arquitectura del sistema

## Objetivo

Automatizar el ciclo completo de una reunión escolar entre docente y
representante:

```
Calendar → preparación del acta → reunión → transcripción →
identificación de participantes → análisis con IA → generación del acta →
revisión docente → firmas → almacenamiento → envío al representante →
seguimiento
```

## Forma del sistema

ACTA PRO es una sola aplicación. El frontend y los servicios viven en el mismo
proyecto (`web/`) y se despliegan juntos.

```
Interfaz (React, iPad)
        │
        ▼
API propia  ──►  Servicios  ──►  Google Calendar · Drive · Gmail
   (Next)          │             OpenAI (transcripción y análisis)
                   │             Runachay
                   ▼
             Base de datos
```

El navegador nunca habla con un servicio externo. Todas las credenciales viven
en el servidor y ninguna variable de entorno lleva el prefijo `NEXT_PUBLIC_`.

> **Nota histórica.** El sistema nació como 17 workflows de n8n. Se consolidó en
> servicios propios porque n8n no llegaba a persistir nada —25 de sus 88 nodos
> eran marcadores vacíos, y eran todas las operaciones de base de datos— y
> mantenerlo habría significado dos sistemas escribiendo sobre el mismo esquema
> sin transacción compartida. Los workflows se conservan en
> [`legacy-n8n/`](legacy-n8n/) como registro de las reglas de negocio.

## Principios

- **Automatización inteligente.** La IA hace el trabajo pesado; nunca decide.
- **Protección docente.** El sistema existe para que un acta no se vuelva contra
  quien la firma.
- **Trazabilidad completa.** Todo evento crítico queda registrado.
- **Privacidad por diseño.** Minimización de datos, separación de lo sensible,
  control de acceso.
- **Nada se pierde ante un fallo.** Un error de integración marca reintento; no
  destruye.

## Servicios

Cada servicio vive en `web/src/services/` y es responsable de un dominio.

| Servicio | Función |
|---|---|
| `calendar` | Detecta reuniones en Google Calendar, evita duplicados y crea eventos de seguimiento |
| `runachay` | Consulta estudiante y representante en la plataforma institucional |
| `meeting` | Registro preliminar de la reunión e inicio de sesión de trabajo |
| `speech` | Transcribe los fragmentos de audio durante la reunión |
| `transcript-cleanup` | Depura el habla transcrita conservando el original |
| `speaker` | Identifica qué persona es cada voz detectada |
| `meeting-ai` | Analiza la transcripción y devuelve JSON estructurado |
| `language-review` | Clasifica la redacción como GREEN / YELLOW / RED y sugiere alternativas |
| `acta-generator` | Construye el acta con sus 13 secciones |
| `approval` | Decisión de la docente. Único camino a `teacher_approved` |
| `signature` | Firmas de docente y representante |
| `document` | Documento final en HTML |
| `pdf` | Acta en PDF: se archiva, se adjunta y se imprime |
| `storage` | Archivo en Drive o en almacenamiento de objetos |
| `email` | Envío del acta y recordatorios |
| `audit` | Registro de eventos críticos |
| `meeting-lifecycle` | Orquesta las dos cadenas del proceso |
| `errors` | Taxonomía de errores y política de reintento |

## Las dos cadenas del proceso

El encadenado está escrito en `meeting-lifecycle.service.ts`, en un solo sitio y
legible de una pieza.

**Cerrar la reunión** — secuencial, porque cada paso necesita el anterior:

```
depuración de la transcripción → análisis con IA → generación del acta →
revisión de lenguaje
```

Si algo falla, la reunión queda en `retry_required` con el motivo y se puede
reintentar. Nada de lo hecho se deshace.

**Firmar el acta** — continúa aunque un paso falle:

```
documento final → archivo en Drive → envío por Gmail → evento de seguimiento
```

Aquí la tolerancia es deliberada: si Drive está caído no tiene sentido dejar de
enviarle el acta al representante, que es lo que de verdad importa. Lo que falla
se registra y se marca para reintento; lo que funcionó se conserva.

## Reglas de la IA

El análisis devuelve **exclusivamente** JSON estructurado, validado contra un
esquema antes de usarse.

```json
{
  "meeting_reason": "",
  "topics": [],
  "background": [],
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
  "language_risk_flags": [],
  "requires_teacher_review": false
}
```

Reglas obligatorias del modelo:

1. No inventar información.
2. No determinar quién tiene la razón.
3. No emitir diagnósticos.
4. No emitir juicios personales.
5. Diferenciar hechos, declaraciones y acuerdos.
6. Todo acuerdo debe poder rastrearse a la transcripción.
7. Ante cualquier incertidumbre, marcar `requires_teacher_review = true`.

## Protección documental

Cada fragmento redactado se clasifica como:

- **GREEN** — adecuado.
- **YELLOW** — requiere revisión.
- **RED** — no recomendado.

**La IA solo sugiere.** Nunca modifica el contenido en silencio. Y la
consecuencia es efectiva, no declarativa: `approval.service` **rechaza la
aprobación** mientras quede un fragmento RED sin decisión explícita de la
docente, y lo hace en el servidor. Una regla que solo vive en la interfaz no es
una regla.

## Estructura del acta

1. Datos generales · 2. Motivo · 3. Antecedentes · 4. Temas tratados ·
5. Intervenciones relevantes · 6. Situaciones analizadas · 7. Acuerdos ·
8. Compromisos · 9. Responsables · 10. Evidencias · 11. Seguimiento ·
12. Observaciones · 13. Firmas

Lenguaje objetivo, profesional, institucional, descriptivo y neutral.

## Datos

Esquema completo en [`web/db/schema.sql`](../web/db/schema.sql).

Tablas: `teachers`, `students`, `representatives`, `meetings`, `participants`,
`transcript_segments`, `meeting_analyses`, `language_findings`, `minutes`,
`signatures`, `documents`, `follow_ups`, `audit_logs`.

Dos decisiones quedan grabadas en el esquema, no solo escritas aquí:

- **`transcript_segments` es una tabla aparte**, pensada para tener permisos
  propios. Conceder acceso a `meetings` no debe dar acceso a lo que se dijo.
- **No hay borrado en cascada desde `meetings`.** Lo más destructivo que permite
  el sistema es marcar `status = 'retry_required'`.

`audit_logs` solo admite inserciones: un registro de auditoría que se puede
editar no sirve para lo que existe.

## Repositorio en Google Drive

```
ACTA PRO/
  Docentes/
    {docente}/
      {estudiante}/
        {año lectivo}/
          {fecha} - {tipo de reunión}
```

Código único del acta: `ACTA-YYYY-ESTUDIANTE-SECUENCIA`.

La transcripción se guarda en una **carpeta raíz distinta**, con permisos
propios. No es una convención de nombres: son dos destinos que se comparten por
separado.

## Seguridad

- Sesión en cookie `httpOnly` firmada con HMAC-SHA256 (Web Crypto, para que
  funcione igual en Node y en el runtime del proxy).
- El proxy exige sesión en todo salvo la pantalla de acceso, incluidas las rutas
  de la API; además cada ruta y cada página la vuelven a comprobar.
- Credenciales solo en el servidor. Google usa OAuth2 con `drive.file`, que da
  acceso únicamente a los archivos que crea la aplicación.
- Separación entre datos operativos y datos sensibles.
- Sin correo verificado del representante, el acta no se envía, y se avisa antes
  de la reunión.

## Estado actual

| Área | Estado |
|---|---|
| Interfaz (6 pantallas, iPad) | Funcionando |
| Servicios | Funcionando en modo demostración |
| Persistencia en memoria | Funcionando |
| Persistencia en PostgreSQL | Esquema definido; adaptador pendiente |
| Google Calendar / Drive / Gmail | Implementado, sin verificar contra las APIs reales |
| OpenAI (transcripción y análisis) | Implementado, sin verificar contra la API real |
| Runachay | Contrato implementado; esquema de respuesta aún desconocido |
| Separación de voces (Deepgram) | Implementado, sin verificar contra la API real |
| Identificación de quién es cada voz | Funcionando: la docente decide una vez por voz |
| Repositorio de actas con búsqueda | Funcionando |
| Autenticación | Contraseña compartida provisional; falta almacén de usuarios |

## Hoja de ruta

- **Ahora**: adaptador de PostgreSQL y verificación de las integraciones reales.
- **Después**: almacén de usuarios e identidad institucional.
- **Fase 3**: diarización automática de hablantes.
- **Fase 4**: firma digital avanzada con validez legal.
- **Fase 5**: panel administrativo y repositorio institucional.
