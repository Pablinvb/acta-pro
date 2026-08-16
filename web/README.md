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
| `GET /api/actas` | Repositorio · `q`, `estudiante`, `desde`, `hasta` |

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
| `/repositorio` | Archivo de todas las actas, con búsqueda |

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

## Transcripción y hablantes

El proveedor se elige con `TRANSCRIPTION_PROVIDER` y se cambia escribiendo un
adaptador en `services/transcription/`. Nada más del sistema se entera.

| Proveedor | Separa voces |
|---|---|
| `deepgram` (por defecto) | Sí |
| `openai` | No |

### Comprobar Deepgram con una grabación real

```bash
npm --prefix web run verify:deepgram -- ruta/al/audio.m4a
```

Manda el archivo a Deepgram e imprime qué devolvió: cuántas intervenciones,
cuántas voces separó, la confianza de cada una y —lo más útil— las muestras que
vería la docente para poner los nombres.

Existe porque la única pregunta que no se puede responder leyendo código es si
la separación funciona con **español ecuatoriano, varias personas y ruido de
aula**, y hacer una reunión entera en la aplicación para averiguarlo es un ciclo
demasiado lento. Sirve cualquier nota de voz del iPad; lo útil es que hablen al
menos dos personas y que alguna interrumpa a otra.

> El vocabulario de nombres propios usa `keywords` en nova-2 y `keyterm` en
> nova-3. Pasar el que no toca **no da error**: Deepgram lo ignora en silencio y
> los nombres siguen saliendo mal. El proveedor elige según el modelo.

Conviene tener clara una distinción que la publicidad de los proveedores mezcla:

> **Diarización ≠ identificación.** Deepgram sabe que hablaron tres personas
> distintas y devuelve «A», «B», «C». **No sabe que «B» es María López**, porque
> no la ha oído nunca. Eso no lo hace ningún proveedor.

De ahí que la docente asigne los nombres **una vez por voz**, no frase por
frase. Al terminar la grabación, la sala cambia de tarea y muestra la pantalla
de identificación: una tarjeta por voz con **su intervención más larga** —un
«buenos días» no basta para reconocer a alguien— y los participantes como
botones. Un toque por voz.

En los datos de demostración, tres decisiones atribuyen ocho intervenciones.

Solo se aceptan personas que constan como participantes de la reunión: así no
puede aparecer en un acta alguien que no estuvo. Es lo máximo que la tecnología
da hoy con garantías suficientes para un documento que alguien va a firmar, y
atribuir una frase a la persona equivocada es exactamente el error que ACTA PRO
existe para evitar.

## Repositorio

`/repositorio` busca entre todas las actas archivadas por estudiante, tipo de
reunión, código o rango de fechas, agrupando por estudiante: la pregunta real de
una docente casi nunca es «dame el acta ACTA-2026-0114», sino «qué se ha hablado
con la familia de este chico». La búsqueda ignora tildes, así que «perez»
encuentra «Pérez».

Con `ACTA_PRO_STORAGE=s3` esta pantalla no es una comodidad: es el único camino
a un acta archivada, porque nadie puede «entrar» a un bucket.

## Almacenamiento

`ACTA_PRO_STORAGE` elige el destino, y la diferencia la nota la docente:

- **`drive`**: puede abrir la carpeta del estudiante y ver sus actas sin pasar
  por la aplicación, y compartirlas con dirección.
- **`s3`**: opaco. Nadie «entra» a un bucket, así que todo acceso pasa por la
  aplicación, que comprueba la sesión. Más trabajo, pero control de acceso de
  verdad: un enlace de Drive compartido por error se queda compartido.

El adaptador `s3` cubre AWS S3 y también **Firebase Storage**: los buckets de
Firebase son buckets de Google Cloud Storage, que expone una API compatible con
S3 mediante claves HMAC. Sirve igual para Cloudflare R2 o MinIO.

Sea cual sea el destino, **el acta y la transcripción van a ubicaciones
separadas** con permisos independientes.

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

`ACTA_PRO_PERSISTENCE=memory` (por defecto) funciona de principio a fin y es con
lo que se desarrolla, pero el estado muere al reiniciar.

Para persistencia real:

```bash
psql "$DATABASE_URL" -f web/db/schema.sql
```

y `ACTA_PRO_PERSISTENCE=postgres` con `DATABASE_URL` en `.env.local`.

### Verificación

```bash
npm --prefix web run verify:db
```

Ejecuta `schema.sql` y el adaptador completo contra **PostgreSQL de verdad**,
usando PGlite —Postgres compilado a WASM que corre en el propio proceso—, así
que no hace falta ni servidor ni Docker. Son 33 comprobaciones sobre el
comportamiento que importa, no sobre que compile: que volver a sincronizar una
reunión no la duplique, que `retry_required` no borre nada, que reenviar un
fragmento de audio no lo duplique, que una sola decisión atribuya todas las
intervenciones de una voz, que volver a firmar sustituya en lugar de acumular, y
que la búsqueda del repositorio ignore las tildes.

### Dos decisiones grabadas en el esquema

- **No hay un solo `DELETE`** en el adaptador. Lo más destructivo posible es
  marcar `status = 'retry_required'`.
- **`transcript_segments` es una tabla aparte**, pensada para permisos
  distintos: conceder acceso a `meetings` no debe dar acceso a lo que se dijo.

Las reuniones se leen de la vista `meetings_read`, que ya trae los nombres y los
participantes agregados, para que ningún servicio tenga que montar el mismo
JOIN.

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
