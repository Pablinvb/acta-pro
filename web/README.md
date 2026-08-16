# ACTA PRO — web app (Fase 1)

Interfaz que consume los workflows de n8n de este repositorio. Next.js 16 (App
Router) + React 19 + TypeScript + Tailwind 4. Diseñada para **iPad**.

## Arrancar

```bash
npm --prefix web install
npm --prefix web run dev
```

Abre http://localhost:3000. Sin configurar nada, la app arranca en **modo
demostración** con los datos de `docs/DATOS_DE_PRUEBA.md`: se puede recorrer el
ciclo completo sin n8n, sin Runachay y sin datos reales de estudiantes.

## Acceso

Todo salvo la pantalla de acceso exige sesión iniciada, incluidas las rutas
`/api/n8n/*`: sin eso, cualquiera podría disparar tus webhooks desde fuera de la
aplicación. Lo aplica `src/proxy.ts`, y además cada página vuelve a comprobarlo
por su cuenta.

La sesión es una cookie `httpOnly` firmada con HMAC-SHA256 mediante Web Crypto,
para que el mismo código funcione en Node y en el runtime Edge del proxy. La
carga útil va firmada, no cifrada, así que solo contiene el identificador de la
docente, su nombre y la caducidad (8 horas).

En producción son **obligatorias**:

```
AUTH_SECRET=…        # openssl rand -base64 32
TEACHER_PASSWORD=…
```

Sin `AUTH_SECRET` el servidor no arranca en producción. En desarrollo se usa un
secreto conocido y la contraseña `acta-pro-demo`, y la pantalla de acceso lo
advierte.

> **Provisional a propósito.** Es una contraseña compartida, no un sistema de
> identidad: todavía no hay almacén de usuarios porque los workflows 03/05/11/14
> tienen la base de datos como `NoOp`. Cuando exista, se sustituye
> `verifyCredentials` en `src/lib/auth.ts` por una consulta real, o se delega en
> Google Workspace / Runachay. El resto del módulo no cambia.

## Conectar con n8n

```bash
cp web/.env.example web/.env.local
```

y en `.env.local`:

```
ACTA_PRO_DATA_SOURCE=n8n
N8N_WEBHOOK_BASE_URL=https://tu-n8n.dominio.com/webhook
```

El navegador **nunca** habla con n8n. Toda llamada pasa por las rutas de
`src/app/api/n8n/*`, que corren en el servidor: así la URL del webhook y las
cabeceras de autenticación no llegan al cliente. Ninguna variable lleva el
prefijo `NEXT_PUBLIC_`.

| Ruta interna | Workflow | Webhook de n8n |
|---|---|---|
| `POST /api/n8n/start-meeting` | 05 | `/acta-pro/start-meeting` |
| `POST /api/n8n/audio-chunk` | 06 | `/acta-pro/audio-chunk` |
| `POST /api/n8n/teacher-review` | 11 | `/acta-pro/teacher-review` |
| `POST /api/n8n/signatures` | 12 | `/acta-pro/signatures` |

Si proteges los webhooks con Header Auth en n8n, define `N8N_AUTH_HEADER_NAME` y
`N8N_AUTH_HEADER_VALUE`.

## Pantallas

| Ruta | Pantalla | Workflows |
|---|---|---|
| `/login` | Acceso docente | — |
| `/agenda` | Agenda de reuniones | 01 · 03 · 04 |
| `/reuniones/[id]/ficha` | Ficha previa | 02 · 03 |
| `/reuniones/[id]/sala` | Sala de reunión | 05 · 06 · 07 |
| `/reuniones/[id]/revision` | Revisión del acta | 08 · 09 · 10 · 11 |
| `/reuniones/[id]/firmas` | Firmas | 12 · 13 |
| `/reuniones/[id]/envio` | Envío y archivo | 14 · 15 · 16 |

## Firmas

Ambas firmas se recogen en el mismo dispositivo al terminar la reunión, que es
como ocurre de verdad: la representante firma en el iPad antes de irse. El pad
usa Pointer Events, así que funciona con dedo, Apple Pencil y ratón, y suaviza
el trazo con curvas cuadráticas — unir con rectas las muestras irregulares de un
dedo produce un garabato que no se parece a la firma de nadie.

Antes de firmar se muestran los acuerdos y compromisos: pedir una firma sobre un
documento que la persona no puede leer sería inaceptable.

> **El workflow 12 exige las dos firmas en la misma llamada** (`teacher_signature`
> y `representative_signature`) y responde 400 `firmas_incompletas` si falta
> cualquiera. Por eso no existe un envío por firmante.

> **El envío del acta no se dispara desde la interfaz.** Los workflows 13, 14 y
> 15 no exponen webhook: se encadenan en n8n cuando el workflow 12 recibe las
> firmas y pone la reunión en `status = signed`. La pantalla de envío muestra
> qué va a pasar y dónde, en lugar de ofrecer un botón que no llamaría a nada.

## Reglas de la arquitectura que la interfaz hace cumplir

No son avisos decorativos: son condiciones que la interfaz impone.

- **La aprobación se bloquea si queda algún fragmento `RED` sin resolver.** El
  workflow 09 clasifica GREEN/YELLOW/RED y solo sugiere; la interfaz obliga a
  que la docente decida sobre cada RED antes de dejar aprobar.
- **Ninguna sugerencia se aplica sola.** El texto del acta solo cambia cuando la
  docente pulsa «Aplicar sugerencia». Si acepta alguna, la decisión viaja al
  workflow 11 como `edited_content`.
- **Una reunión sin correo verificado del representante no se puede enviar.** Se
  avisa en la agenda y en la ficha previa, no al final.
- **La transcripción nunca se adjunta ni se archiva junto al acta.** La pantalla
  de envío muestra su ubicación restringida por separado.
- **Un fallo de red no destruye nada.** Si un fragmento de audio o una decisión
  no llega, se informa y se puede reintentar; no se descarta lo ya procesado.

## Grabación de audio

La sala usa `MediaRecorder` y envía fragmentos de 30 s al workflow 06 mientras
la reunión ocurre, en lugar de subir un archivo al final: si algo falla a mitad,
se pierde un fragmento y no la reunión entera.

La grabación **no empieza sin una acción explícita**. No se pide el micrófono al
cargar la pantalla.

La forma de onda se dibuja leyendo el `AnalyserNode` del stream real, así que es
la prueba visible de que se está captando audio: un permiso mal concedido o un
micrófono ocupado por otra aplicación se ve al instante, y no cuando ya no hay
reunión que repetir.

## Hablantes

El workflow 07 (diarización) es todavía un marcador de posición y la
identificación automática es Fase 3, así que en Fase 1 **la asignación manual es
el mecanismo**, no un apaño. Cada fragmento lleva un selector con los
participantes de la reunión, y hay una acción para aceptar de golpe los
hablantes propuestos por la transcripción.

Terminar la reunión con fragmentos sin hablante confirmado exige una segunda
pulsación: el acta atribuye frases a personas concretas, y una atribución
equivocada es justo el error que la protección documental existe para evitar.

## Trabajo en curso

Las decisiones de revisión se guardan en `sessionStorage` mientras no se hayan
enviado, para que una recarga a mitad no las pierda. Se usa `sessionStorage` y
no `localStorage` a propósito: el borrador contiene decisiones sobre el acta de
un menor y el iPad de un aula puede pasar por varias manos, así que se vacía al
cerrar la pestaña. Es una caché de trabajo, **no una fuente de verdad**: esa es
la base de datos de n8n.

## Estructura

```
web/src/
├── app/
│   ├── agenda/                 Pantalla 01
│   ├── reuniones/[id]/         Pantallas 02–05
│   ├── api/n8n/                Capa BFF hacia los webhooks
│   ├── globals.css             Tokens de color y tipografía
│   └── layout.tsx
├── components/                 Rail, AppShell y primitivas visuales
└── lib/
    ├── types.ts                Dominio, derivado de docs/ARQUITECTURA.md
    ├── n8n.ts                  Cliente de los 4 webhooks (solo servidor)
    ├── runachay.ts             Contrato del WF 02
    ├── env.ts                  Configuración (solo servidor)
    └── mock/data.ts            Datos ficticios de demostración
```

## Pendiente

- **Runachay**: `src/lib/runachay.ts` implementa el contrato que define el WF 02,
  pero el esquema real de la respuesta aún no se conoce — el propio workflow lo
  anota. Cuando llegue la documentación, solo hay que ajustar `mapStudent` y
  `mapRepresentative`.
- **Persistencia**: los workflows 03, 05, 06, 11, 14, 15 y 17 tienen nodos `NoOp`
  como marcador de la base de datos. Hasta que exista, el estado de la reunión no
  sobrevive a una recarga.
- **Autenticación**: no hay login todavía. La docente está fijada en los datos de
  demostración.
- **Workflows 07, 12, 13 y 16**: la interfaz ya los contempla, pero los
  workflows aún no están implementados.
