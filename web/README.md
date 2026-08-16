# ACTA PRO — aplicación

Interfaz, servicios y API en un solo proyecto. Next.js 16 (App Router) +
React 19 + TypeScript + Tailwind 4. La interfaz está diseñada para **iPad**.

## Arrancar

```bash
npm --prefix web install
npm --prefix web run dev
```

http://localhost:3000 · usuario `T-045`, contraseña `acta-pro-demo`.

Sin configuración arranca en **modo demostración**: el ciclo completo funciona
con los datos de `docs/DATOS_DE_PRUEBA.md`, sin servicios externos ni base de
datos. Para conectar lo real, copia `.env.example` a `.env.local`.

## Estructura

```
web/src/
├── app/
│   ├── login/                  Acceso docente
│   ├── agenda/                 Pantalla 01
│   ├── reuniones/[id]/         Pantallas 02–06
│   └── api/reuniones/[id]/     API propia
├── services/                   Un servicio por dominio del proceso
├── repositories/               Persistencia (memoria · PostgreSQL)
├── components/                 Rail, armazón y primitivas visuales
├── lib/                        Sesión, tipos, datos de demostración
├── proxy.ts                    Puerta de entrada: exige sesión
└── db/schema.sql               Esquema de la base de datos
```

## Servicios

Cada servicio sustituye a un workflow de n8n. La correspondencia completa y los
fallos del original que se corrigieron al portarlo están en
[`docs/legacy-n8n/`](../docs/legacy-n8n/).

| Servicio | Responsabilidad |
|---|---|
| `calendar` | Reuniones desde Calendar, sin duplicar; eventos de seguimiento |
| `runachay` | Estudiante y representante desde la plataforma del centro |
| `meeting` | Registro e inicio de la reunión |
| `speech` | Transcripción de los fragmentos de audio |
| `transcript-cleanup` | Depura el habla transcrita, conservando el original |
| `speaker` | Confirmación de hablantes |
| `meeting-ai` | Análisis de la transcripción |
| `language-review` | Clasificación GREEN / YELLOW / RED |
| `acta-generator` | Las 13 secciones del acta |
| `approval` | Decisión de la docente |
| `signature` | Firmas de ambas partes |
| `document` | Documento final en HTML |
| `pdf` | Acta en PDF, para archivar, adjuntar e imprimir |
| `storage` | Archivo en Drive |
| `email` | Envío y recordatorios |
| `audit` | Registro de eventos |
| `meeting-lifecycle` | Orquestación de las dos cadenas |

## API

Todas las rutas exigen sesión. El proxy responde 401 a `/api/*` sin sesión en
lugar de redirigir, para que el cliente distinga una sesión caducada de una
página HTML.

| Ruta | Qué hace |
|---|---|
| `POST /api/reuniones/[id]/iniciar` | Marca la reunión en curso |
| `POST /api/reuniones/[id]/audio` | Recibe y transcribe un fragmento |
| `POST /api/reuniones/[id]/hablantes` | Confirma quién habló |
| `POST /api/reuniones/[id]/cerrar` | Análisis → acta → revisión de lenguaje |
| `GET · POST /api/reuniones/[id]/revision` | Hallazgos y decisión de la docente |
| `GET · POST /api/reuniones/[id]/firmas` | Firmas y toda la cadena posterior |
| `GET /api/reuniones/[id]/acta.pdf` | Acta en PDF · `?descargar` fuerza la descarga |
| `GET /api/reuniones/[id]/auditoria` | Traza de la reunión |

## Pantallas

| Ruta | Pantalla |
|---|---|
| `/login` | Acceso docente |
| `/agenda` | Agenda de reuniones |
| `/reuniones/[id]/ficha` | Ficha previa |
| `/reuniones/[id]/sala` | Sala de reunión |
| `/reuniones/[id]/revision` | Revisión del acta |
| `/reuniones/[id]/firmas` | Firmas |
| `/reuniones/[id]/envio` | Envío y archivo |

## Reglas que el sistema hace cumplir

No son avisos en pantalla: son condiciones que el servidor aplica.

- **No se aprueba un acta con fragmentos RED sin resolver.** `approval.service`
  devuelve 409 mientras quede alguno sin decisión explícita. Una regla que solo
  vive en el frontend no es una regla.
- **La IA nunca cambia el acta sola.** El cliente envía qué sugerencias aceptó,
  no el texto reescrito: el servicio las aplica sobre el acta que él mismo
  guardó, de modo que lo aprobado y lo mostrado son el mismo documento.
- **El acta se firma entera o no se firma.** Faltando una firma, 400.
- **Sin correo verificado del representante no se envía nada**, y se avisa antes
  de la reunión.
- **La transcripción nunca se adjunta ni se archiva junto al acta.** Va a otra
  carpeta de Drive, con permisos propios.
- **Un fallo no destruye nada.** La reunión queda en `retry_required` con el
  motivo; lo ya procesado se conserva.

## Acceso

Sesión en cookie `httpOnly` firmada con HMAC-SHA256 mediante Web Crypto, para
que el mismo código funcione en Node y en el runtime del proxy. La carga útil va
firmada, no cifrada: solo lleva identificador, nombre y caducidad (8 horas).

En producción `AUTH_SECRET` y `TEACHER_PASSWORD` son obligatorias. En desarrollo
se usa un secreto conocido y la contraseña `acta-pro-demo`; el secreto de
desarrollo es determinista a propósito, porque un valor aleatorio por proceso
impide que el proxy verifique la cookie que acaba de firmar el server action.

> **Provisional.** Es una contraseña compartida, no un sistema de identidad.
> Sustituir `verifyCredentials` en `src/lib/auth.ts` cuando exista el almacén de
> usuarios.

## Grabación y hablantes

La sala usa `MediaRecorder` y envía fragmentos de 30 s durante la reunión, en
lugar de subir un archivo al final: si algo falla a mitad, se pierde un fragmento
y no la grabación entera. La grabación **no empieza sin una acción explícita**.

La forma de onda se dibuja leyendo el `AnalyserNode` del stream real: es la
prueba visible de que se está captando audio.

La identificación automática de hablantes es Fase 3, así que en Fase 1 **la
confirmación manual es el mecanismo**, no un apaño: la docente estuvo en la
reunión. Terminar con fragmentos sin confirmar exige una segunda pulsación.

## Depuración de la transcripción

El reconocimiento de voz devuelve el habla tal cual: «eh», «o sea», frases
empezadas y abandonadas. Antes de analizar, `transcript-cleanup` la depura, y el
modelo extrae mucho mejor los acuerdos de un texto limpio.

> **El texto original nunca se modifica.** La versión depurada se guarda aparte,
> en `clean_text`. Si alguien discute lo que dice un acta, hay que poder mostrar
> exactamente lo que se transcribió, no una versión que un modelo consideró más
> presentable. Depurar sobre el original destruiría la evidencia que este
> producto existe para producir.

El servicio tiene prohibido cambiar el significado, suavizar lo que alguien
expresó o corregir el registro de nadie. Solo quita ruido.

## Acta en PDF

El PDF es el formato que se archiva en Drive, se adjunta al correo y se
descarga. Se genera texto real con PDFKit, no una captura: queda seleccionable y
buscable, que es justo lo que hace falta cuando se busca un acta dos años
después.

`?descargar` fuerza la descarga; sin el parámetro se abre en el visor, que en
iPad es lo que permite mandarlo a imprimir directamente.

> PDFKit lee sus métricas de fuente del disco en tiempo de ejecución, así que
> está declarado en `serverExternalPackages`. Sin eso falla con `ENOENT` al
> crear el documento.

## Firmas

Ambas se recogen en el mismo dispositivo al terminar la reunión, que es como
ocurre de verdad. El pad usa Pointer Events —dedo, Apple Pencil o ratón— y
suaviza el trazo con curvas cuadráticas: unir con rectas las muestras
irregulares de un dedo produce un garabato que no se parece a la firma de nadie.

Antes de firmar se muestran los acuerdos y compromisos. Pedir una firma sobre un
documento que la persona no puede leer sería inaceptable.

## Persistencia

`ACTA_PRO_PERSISTENCE=memory` funciona hoy de principio a fin y es con lo que se
desarrolla. El adaptador de PostgreSQL está pendiente; el esquema completo está
en [`db/schema.sql`](db/schema.sql) y `getRepositories()` falla en voz alta si se
selecciona `postgres`, en lugar de fingir que existe.

Las decisiones de revisión en curso se guardan en `sessionStorage` para que una
recarga no las pierda. Se usa `sessionStorage` y no `localStorage` a propósito:
contienen decisiones sobre el acta de un menor y el iPad de un aula puede pasar
por varias manos.

## Pendiente

- Adaptador de PostgreSQL.
- **Las integraciones de Google y OpenAI están escritas pero no verificadas
  contra las APIs reales**: hacen falta credenciales.
- Almacén de usuarios.
- El esquema de respuesta de Runachay sigue sin conocerse; el mapeo está aislado
  en `mapStudent` y `mapRepresentative`.
