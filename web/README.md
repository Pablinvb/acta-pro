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
| `history` | Qué quedó de las reuniones anteriores del estudiante |
| `acta-generator` | Las 13 secciones del acta |
| `approval` | Decisión de la docente |
| `signature` | Firmas de ambas partes |
| `seal` | Huella SHA-256 del acta firmada |
| `timestamp` | Sellado RFC 3161 con autoridad externa |
| `document` | Documento final en HTML |
| `pdf` | Acta en el formato del centro, para archivar, adjuntar e imprimir |
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
| `GET /api/reuniones/[id]/sello.tsr` | Token de sellado RFC 3161, para verificarlo aparte |
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

Dos servicios independientes que responden a preguntas distintas, y un motor que
las cruza:

| | Pregunta | Servicio |
|---|---|---|
| Transcripción | qué se dijo y **cuándo**, palabra a palabra | Whisper (OpenAI) |
| Separación de voces | quién habló y **cuándo** | pyannoteAI |
| Alineación | quién dijo qué | propio, `services/transcription/alignment.ts` |

Se llaman **en paralelo**, porque son independientes: encadenarlas duplicaría la
espera sin ganar nada. Whisper acierta «Runachay» donde otros escriben
«Sorronachai»; pyannote sabe que hablaron dos personas y dónde cambia el turno.

Sin `PYANNOTE_API_KEY` la aplicación sigue funcionando: se transcribe igual y la
docente atribuye las intervenciones a mano al cerrar la reunión.

### Por qué hace falta alinear palabra a palabra

Con una grabación real de dos minutos, la separación por frases fundía turnos:

> «¿Ha visto algo que le ha llamado la atención? Sí, pasa que Sofía no está»

quedaba como **una** intervención de **una** voz, siendo dos personas. pyannote
sitúa el corte en 21,82 s, y como Whisper marca el tiempo de cada palabra, la
alineación parte la frase donde de verdad cambia el hablante.

Tres decisiones del motor, todas por evidencia medida:

- **La confianza es el margen sobre la segunda voz, no el solape con la
  primera.** Una frase mezclada daba 0,625 con el solape —por encima del umbral
  de 0,6, o sea, se colaba— y 0,25 con el margen.
- **Las palabras huérfanas se adoptan.** Las que caen en un silencio entre
  turnos quedaban sin hablante y partían una frase en tres. Con adopción por
  cercanía dentro de 2 s: 17 → 12 intervenciones.
- **La pasada final es sobre la grabación entera.** Los fragmentos de 30 s se
  diarizan por separado, así que la «Voz A» del minuto 1 no es la misma persona
  que la del minuto 2. Solo transcribiendo todo de una vez salen etiquetas
  coherentes.

Resultado con esa grabación: Whisper 9,9 s, 40 turnos, 2 voces, 13
intervenciones, **0,92 de confianza media**, 1 marcada para revisar.

```bash
npm --prefix web run verify:chain -- ruta/al/audio.m4a 2
```

Ejecuta la cadena completa sobre un audio real e imprime la transcripción
atribuida. Existe porque la única pregunta que no se puede responder leyendo
código es si funciona con **español ecuatoriano, varias personas y ruido de
aula**. Sirve cualquier nota de voz del iPad; lo útil es que hablen al menos dos
personas y que alguna interrumpa a otra.

### Por qué dos servicios y no `gpt-4o-transcribe-diarize`

OpenAI ofrece un modelo que transcribe y separa voces en una sola llamada. Se
midió contra la misma grabación real de dos minutos que el resto del sistema:

| | Whisper + pyannote | `gpt-4o-transcribe-diarize` |
|---|---|---|
| Tiempo | ~10 s (en paralelo) | **54,7 s** |
| Voces detectadas (hay 2) | **2** | 3 en una ejecución, 4 en otra |
| Parte la frase que mezcla dos personas | sí | sí |
| Llamadas | 2 | 1 |

Las voces de más no son un detalle: eran fragmentos de 0,1 y 0,2 segundos —«A»,
«no.»— que el modelo atribuyó a hablantes inventados. En ACTA PRO eso se
traduce en pedirle a la docente que identifique cuatro voces cuando en la sala
había dos, y la inestabilidad entre ejecuciones lo empeora.

Se queda la combinación de dos servicios: cinco veces más rápida y con el número
de voces correcto. Merece la pena revisarlo cuando el modelo madure.

Conviene tener clara una distinción que la publicidad de los proveedores mezcla:

> **Diarización ≠ identificación.** pyannote sabe que hablaron tres personas
> distintas y devuelve «A», «B», «C». **No sabe que «B» es María López**, porque
> no la ha oído nunca. Eso no lo hace ningún proveedor.

Y por eso lo que devuelve **no es dato biométrico**: son etiquetas anónimas
válidas solo dentro de una grabación, que no identifican a nadie ni permiten
reconocer a esa persona en otra reunión. Se descartó a propósito la idea de
guardar huellas de voz para identificar automáticamente: serían datos
biométricos de menores y de sus familias, con la clasificación que eso implica
en la LOPDP, a cambio de ahorrar dos toques de pantalla.

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

## Historial del estudiante

Una reunión con una familia casi nunca es la primera, pero cada una empezaba de
cero. La ficha previa abre ahora con lo que quedó de la vez anterior, y esos
acuerdos entran en los **antecedentes** del acta nueva citando la fecha y el
código del acta firmada de la que salen: un antecedente sin procedencia es una
afirmación sin respaldo.

Se lee del acta guardada y no del análisis, porque el acta es lo que la docente
aprobó y las dos partes firmaron.

> **No dice si algo se cumplió.** Nadie registra el cumplimiento en ninguna
> parte. Sabe qué se acordó, cuándo, y si llegó la fecha de revisión sin que
> hubiera otra reunión. Presentar «incumplido» a partir de eso sería inventar un
> hecho contra una familia, que es justo de lo que este producto protege. La
> pantalla lo dice con todas las letras.

Sólo se arrastra lo de la **última** reunión. Un acuerdo de marzo que ya se
retomó en junio no está pendiente: se habló de él. Arrastrar el curso entero
llenaría la pantalla de cosas resueltas y la docente dejaría de leerla, que es
la forma más segura de que se le escape la que sí importaba.

## Acta en PDF

El PDF reproduce el formulario **FORMATO ACTA REUNIÓN** del centro: datos
generales, antecedentes, desarrollo, la tabla de acuerdos y compromisos con
responsable y fecha plazo, y el registro de asistencia con las firmas.

No es estética. Un acta con formato propio obligaría a la docente a copiarla a
mano al formato bueno, y la aplicación dejaría de ahorrarle trabajo.

Se genera texto real con PDFKit, no una captura: queda seleccionable y buscable,
que es justo lo que hace falta cuando se busca un acta dos años después. La
correspondencia entre las 13 secciones internas y los apartados del formulario
vive aislada en `services/acta-format.ts`, para que el día que el centro cambie
su formulario haya un solo sitio donde mirar.

### La columna RESPONSABLE

El análisis devuelve los responsables de la reunión entera, no uno por acuerdo,
así que hay que deducirlo. Tres reglas, en este orden: el nombre citado dentro
del acuerdo; el papel con el que **empieza** el acuerdo («la docente
registrará…»); o, si sólo hay un responsable en toda la reunión, ese.

Si ninguna se cumple, **la casilla queda vacía a propósito**. Probando contra el
acta real, buscar el papel en cualquier posición adjudicaba «Reporte de avance
el primer viernes de cada mes al correo de la representante» a la madre, cuando
quien envía el reporte es la docente: ahí la representante es la destinataria.
Una casilla vacía se rellena a mano; una atribución falsa firmada por las dos
partes no se deshace.

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

> La tinta del pad es **negro fijo**, no el color de texto del tema. Cuando se
> derivaba del tema, bajo el tema oscuro la firma se dibujaba en blanco: se veía
> perfectamente en pantalla y salía invisible en el PDF. Un fallo silencioso en
> lo único que hace que el documento pruebe algo.

## Los dos sellos

Al firmar se producen dos cosas distintas, y la diferencia importa.

**Sello de integridad (propio).** Una huella SHA-256 sobre una serialización
determinista del acta, las dos firmas y el instante. Va impresa en el PDF en
grupos de ocho —sesenta y cuatro caracteres seguidos no los compara nadie— y
demuestra que el acta archivada es palabra por palabra la que se firmó.

Guardar la hora en una columna no demostraría nada: una columna se edita. La
huella depende del contenido, así que cambiar una línea del acta, mover la fecha
de firma o sustituir una imagen produce una huella distinta.

**Sello de tiempo (RFC 3161, autoridad externa).** El anterior no demuestra
*cuándo* frente a un tercero, porque el instante lo pone el servidor del propio
centro — y es justo eso lo que hace falta si alguien sostiene que un acta se
redactó después de los hechos. La huella se envía a una autoridad independiente
que devuelve un token firmado. El acta imprime quién selló, cuándo y con qué
número de serie.

```bash
# El token se descarga aparte y se verifica SIN pasar por ACTA PRO
curl -o acta.tsr .../api/reuniones/ACTA-2026-0001/sello.tsr
openssl ts -verify -in acta.tsr -token_in -digest <huella impresa> -CAfile cadena.pem
```

Que la verificación no dependa de la herramienta que creó el sello es el valor
entero: si sólo se pudiera comprobar con ACTA PRO, no probaría nada ante quien
desconfía de ACTA PRO.

El ASN.1 DER de la petición y la lectura de la respuesta están escritos a mano
en `services/rfc3161.ts` —es un formato pequeño y bien especificado—. Lo que
**no** se hace a mano es validar la firma del token contra la cadena de
certificados: eso es criptografía de verdad y escribirla uno mismo es como se
cometen los errores.

Tres comprobaciones antes de dar un sello por bueno, porque un token legítimo
**de otro documento** verificaría igual de bien y archivarlo daría un respaldo
aparente que se desmorona justo cuando hace falta:

- que la huella sellada sea la nuestra;
- que el nonce devuelto sea el que enviamos, contra sellos reutilizados;
- que la fecha no se aleje más de un día de la del servidor.

> **Un fallo de la autoridad nunca tumba la firma.** Si no responde, el acta se
> firma con el sello propio y queda constancia en la auditoría. El PDF distingue
> los dos casos por escrito, porque un docente que crea tener más respaldo del
> que tiene está peor protegido que uno que sabe cuál es.

`ACTA_PRO_TSA_URL` apunta por defecto a FreeTSA, pública y sin cuenta, para que
funcione desde el primer día. **Para valor legal en Ecuador hay que apuntarlo a
una entidad de certificación acreditada** —Banco Central del Ecuador, Security
Data, ANF—. Vacío desactiva el sellado externo.

## Persistencia

`ACTA_PRO_PERSISTENCE=memory` (por defecto) funciona de principio a fin y es con
lo que se desarrolla, pero **el estado muere al reiniciar**. Eso incluye las
actas firmadas y sus sellos de tiempo, así que no sirve para reuniones reales:
el respaldo que acabamos de construir duraría hasta el siguiente despliegue.

Para persistencia real: `ACTA_PRO_PERSISTENCE=postgres` y `DATABASE_URL` en
`.env.local`, tras aplicar el esquema:

```bash
psql "$DATABASE_URL" -f web/db/schema.sql
```

Vale cualquier PostgreSQL 14 o superior. El adaptador usa SQL estándar y `pg`:
no depende de ninguna extensión ni de ningún proveedor.

### Con Supabase

Supabase es PostgreSQL, así que funciona con el mismo adaptador y sin tocar
código. Lo único que cambia es de dónde sale `DATABASE_URL`.

1. **Crea el proyecto** en https://supabase.com y elige la región más cercana
   (`South America (São Paulo)` para Ecuador).
2. **Aplica el esquema.** En el panel: *SQL Editor* → pega `web/db/schema.sql` →
   *Run*. O desde tu máquina con `psql`.
3. **Copia la cadena de conexión.** *Project Settings → Database → Connection
   string → URI*. Usa la del **pooler en modo `transaction`** (puerto `6543`),
   no la conexión directa: en un despliegue con funciones serverless, las
   conexiones directas se agotan enseguida.
4. En `.env.local`:

```bash
ACTA_PRO_PERSISTENCE=postgres
DATABASE_URL=postgresql://postgres.<ref>:<contraseña>@aws-0-<región>.pooler.supabase.com:6543/postgres
DATABASE_SSL=true
DATABASE_POOL_MAX=5
```

5. Carga los datos de demostración y comprueba que todo responde:

```bash
npm --prefix web run db:seed
npm --prefix web run verify:supabase
```

> `DATABASE_POOL_MAX` bajo a propósito con el pooler: quien reparte las
> conexiones es Supabase, y abrir un pool grande contra un pool ajeno sólo sirve
> para chocar con su límite.

### Dos trampas que cuestan una tarde

Las dos producen el mismo síntoma —la base conecta, las comprobaciones pasan, y
la aplicación no guarda nada— y por eso `verify:supabase` las busca antes de
tocar la red.

**Caracteres especiales en la contraseña.** Si contiene `@`, `$`, `#`, `/` o
`?`, hay que **codificarla en porcentaje** dentro de la URL: `@` → `%40`,
`$` → `%24`. Un `@` sin codificar parte la cadena donde no toca y `pg` autentica
con una contraseña truncada. Y el `$` es peor, porque Next expande variables al
leer `.env` (dotenv-expand): un `$` dentro de la contraseña se sustituye por una
variable inexistente y desaparece sin decir nada.

**Claves repetidas en `.env.local`.** Gana **la última**. Este proyecto lo sufrió
con `ACTA_PRO_PERSISTENCE`: `postgres` arriba y un `memory` olvidado al final.
La base estaba perfectamente conectada y la aplicación guardaba en memoria.

> Los scripts leen `.env.local` con `scripts/env.mts`, que aplica la misma regla
> que dotenv. Antes cada uno tenía su propio bucle donde ganaba la **primera**
> aparición, de modo que la comprobación decía «conectado a PostgreSQL» mientras
> la aplicación usaba memoria. Un verificador que lee la configuración de forma
> distinta a la aplicación no es que no ayude: miente con autoridad.

### Datos de demostración en una base real

```bash
npm --prefix web run db:seed
```

Con persistencia en memoria los datos ficticios se cargan solos al arrancar; una
base de verdad nace vacía, y una aplicación que no enseña nada parece averiada.
El comando es idempotente y escribe **con los mismos métodos que usa la
aplicación** —nada de `INSERT` a mano—, de modo que si un repositorio se rompe,
esto se rompe también en lugar de disimularlo.

De hecho ya encontró un fallo: el archivo de actas referenciaba reuniones que no
existían. En memoria nadie lo notaba, porque no hay integridad referencial;
contra PostgreSQL la clave foránea lo rechazó.

Dos cosas que **no** se usan de Supabase, y conviene saber por qué:

- **Ni el cliente `supabase-js` ni las claves `anon`.** Están pensados para que
  el navegador hable directamente con la base, y aquí ninguna credencial pisa el
  navegador: todo pasa por la API propia, que ya comprueba la sesión.
- **Ni Row Level Security.** Sirve cuando el cliente se conecta por su cuenta;
  con acceso sólo desde el servidor, las reglas viven en los servicios, que es
  donde se pueden leer y verificar. Si algún día el navegador llegara a
  conectarse directamente, RLS pasaría de recomendable a obligatorio.

Supabase también ofrece almacenamiento compatible con S3, así que
`ACTA_PRO_STORAGE=s3` podría apuntar ahí en lugar de a Drive. Hoy el modo por
defecto es Drive, porque la docente puede abrir la carpeta del estudiante sin
pasar por la aplicación.

### Verificación

```bash
npm --prefix web run verify:db
```

Ejecuta `schema.sql` y el adaptador completo contra **PostgreSQL de verdad**,
usando PGlite —Postgres compilado a WASM que corre en el propio proceso—, así
que no hace falta ni servidor ni Docker. Son 41 comprobaciones sobre el
comportamiento que importa, no sobre que compile: que volver a sincronizar una
reunión no la duplique, que `retry_required` no borre nada, que reenviar un
fragmento de audio no lo duplique, que una sola decisión atribuya todas las
intervenciones de una voz, que volver a firmar sustituya en lugar de acumular,
que el instante de firma y el token de sellado vuelvan intactos, y que la
búsqueda del repositorio ignore las tildes.

> Que el instante vuelva intacto no es una comprobación de adorno. El adaptador
> guardaba `signed_at = now()` con el reloj de la base en lugar del recibido, de
> modo que el momento almacenado no era el usado para calcular la huella y el
> sello impreso en el acta no habría cuadrado nunca.

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

## Verificación

Seis suites, ninguna necesita desplegar nada:

| Comando | Qué comprueba |
|---|---|
| `verify:db` | Esquema y adaptador contra PostgreSQL real (PGlite) |
| `verify:acta` | Historial y correspondencia con el formulario del centro |
| `verify:alignment` | Quién dijo qué: confianza, huérfanas, umbrales |
| `verify:seal` | Que alterar cualquier cosa cambia la huella |
| `verify:tsa` | Petición RFC 3161 byte a byte; con `-- --red`, contra la autoridad |
| `verify:marks` | Que las marcas de la docente caen en la intervención correcta |
| `verify:supabase` | Configuración, esquema, escritura y concurrencia en la base alojada |
| `verify:chain` | La cadena completa sobre una grabación real (necesita audio y claves) |

## Pendiente

- **Autoridad de sellado acreditada.** FreeTSA funciona y verifica, pero no
  tiene valor legal en Ecuador.
- **Los datos del estudiante y del representante siguen saliendo del expediente
  de demostración** cuando coinciden con la reunión abierta. Vienen de Runachay,
  que no está conectado; si no coinciden, la ficha lo dice en lugar de enseñar
  los de otra familia.
- **Gmail sólo se confirma enviando.** `gmail.send` no da acceso de lectura a
  nada —esa es su gracia—, así que no hay comprobación inocua posible.
- Almacén de usuarios: hoy es una contraseña compartida.
- El esquema de respuesta de Runachay sigue sin conocerse; el mapeo está aislado
  en `mapStudent` y `mapRepresentative`.
