# Diseño de interfaz — ACTA PRO (Fase 1)

Diseño de la web app que consume los workflows de n8n de este repositorio.
Plataforma objetivo: **iPad** (marcos de 1024×768). Alcance: la cadena mínima de la Fase 1.

## Contenido

| Archivo | Qué es |
|---|---|
| [`prototipo.html`](prototipo.html) | Prototipo clickeable, autocontenido, con las 5 pantallas y datos de `docs/DATOS_DE_PRUEBA.md`. Se abre directamente en el navegador. |

Archivo de Figma (variables, estilos de texto y componentes):
https://www.figma.com/design/ARaeZXrkiOM1nrX5WWXScC

## Pantallas y su correspondencia con los workflows

| # | Pantalla | Workflows | Prototipo | Figma |
|---|---|---|:---:|:---:|
| 01 | Agenda de reuniones | 01 · 03 · 04 | ✅ | ✅ |
| 02 | Ficha previa del estudiante | 02 · 03 | ✅ | ✅ |
| 03 | Sala de reunión en vivo | 05 · 06 · 07 | ✅ | — |
| 04 | Revisión del acta | 08 · 09 · 10 · 11 | ✅ | — |
| 05 | Envío y archivo | 14 · 15 · 16 | ✅ | — |

## Webhooks que el frontend debe consumir

| Endpoint | Workflow | Pantalla |
|---|---|---|
| `POST /acta-pro/start-meeting` | 05 | 03 |
| `POST /acta-pro/audio-chunk` | 06 | 03 |
| `POST /acta-pro/teacher-review` | 11 | 04 |
| `POST /acta-pro/signatures` | 12 | 05 |

`teacher-review` acepta `decision: approve | edit | reject` y devuelve el nuevo `status`.

## Decisiones de diseño

- **La navegación es el pipeline.** Los cinco pasos numerados del rail lateral son el ciclo real de
  la reunión en orden, y cada uno declara los workflows que lo alimentan.
- **El acento nunca es verde, ámbar ni rojo.** Esos tres colores están reservados para los niveles
  `GREEN` / `YELLOW` / `RED` del workflow 09. El color institucional es un índigo que no compite con
  el semáforo.
- **Tipografía por función.** El acta se compone en Source Serif 4 porque es un registro
  institucional; la interfaz que la produce usa IBM Plex Sans; los códigos, horas y `meeting_id`
  usan IBM Plex Mono con cifras tabulares.
- **Objetivos táctiles de 44 px** en todos los controles, por el uso en iPad.
- **La aprobación está bloqueada mientras queden fragmentos `RED` sin resolver.** La regla de
  protección documental del workflow 09 se hace cumplir en la interfaz, no solo se muestra.
- **La transcripción se representa siempre separada del acta**, con su ruta restringida propia, tal
  como exige `docs/ARQUITECTURA.md`.

## Tokens

El prototipo define la paleta completa en variables CSS, con tema claro y oscuro. En Figma la
paleta clara está en la colección `Color`; el equivalente oscuro de cada token está anotado en la
descripción de la variable, porque el plan actual de Figma limita las colecciones a un solo modo.
