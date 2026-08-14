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
| `/agenda` | Agenda de reuniones | 01 · 03 · 04 |
| `/reuniones/[id]/ficha` | Ficha previa | 02 · 03 |
| `/reuniones/[id]/sala` | Sala de reunión | 05 · 06 · 07 |
| `/reuniones/[id]/revision` | Revisión del acta | 08 · 09 · 10 · 11 |
| `/reuniones/[id]/envio` | Envío y archivo | 14 · 15 · 16 |

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
