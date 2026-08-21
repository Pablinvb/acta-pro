# ACTA PRO

**Aplicación para que los docentes documenten sus reuniones con representantes
sin que el acta se vuelva en su contra.**

ACTA PRO cubre el ciclo completo de una reunión escolar: detecta la cita en
Google Calendar, prepara la ficha del estudiante con lo que quedó de la reunión
anterior, graba y transcribe la reunión separando las voces, analiza la
conversación con IA, redacta el acta en el formato del centro, señala la
redacción que podría comprometer al docente, recoge las firmas de ambas partes,
las sella con una autoridad de tiempo, archiva el documento y lo envía al
representante.

## Qué lo hace distinto

La parte interesante no es la automatización, es **la protección documental**.
Tres cosas concretas:

**1 · La IA solo sugiere.** Un acta que dice «la madre se muestra despreocupada»
es un juicio de valor que puede volverse contra quien la firmó. ACTA PRO revisa
cada fragmento antes de firmar, lo clasifica como adecuado / a revisar / no
recomendado y propone una redacción objetiva. Nunca cambia una palabra sin
decisión explícita de la docente, y el sistema se niega a aprobar un acta que
conserve fragmentos no recomendados sin resolver.

**2 · Quién dijo qué se decide con evidencia.** Whisper responde «qué se dijo y
cuándo»; pyannote responde «quién habló y cuándo». Un motor de alineación cruza
ambas palabra a palabra, de modo que una frase que mezcla a dos personas se
parte donde cambia el turno. Medido con una grabación real: 13 intervenciones,
0,92 de confianza media. Lo que el sistema no sabe con certeza lo marca para que
lo revise la docente, en lugar de adivinar.

**3 · El acta prueba cuándo se firmó.** Al firmar se calcula una huella SHA-256
del acta, las dos firmas y el instante, y se envía a una **autoridad de sellado
RFC 3161** que devuelve un token firmado. Cualquiera puede comprobarlo por su
cuenta, sin pasar por ACTA PRO:

```bash
openssl ts -verify -in acta.tsr -token_in -digest <huella impresa> -CAfile cadena.pem
```

## Arrancar

```bash
npm --prefix web install
npm --prefix web run dev
```

Arranca en **modo demostración**: el ciclo completo funciona con datos
ficticios, sin Google, sin OpenAI y sin Runachay.

Para entrar hace falta una cuenta. Se crea con:

```bash
npm --prefix web run usuarios -- alta T-045 "Ana Pérez" correo@colegio.edu.ec
```

La contraseña se genera y se imprime una sola vez. No hay contraseña compartida:
cada docente entra con la suya y **sólo alcanza sus propias reuniones**.

## Estructura

```
acta-pro/
├── web/                    Aplicación completa (interfaz + servicios + API)
│   ├── src/app/            Pantallas y rutas de la API
│   ├── src/services/       Un servicio por dominio del proceso
│   ├── src/repositories/   Persistencia
│   ├── db/schema.sql       Esquema de la base de datos
│   └── README.md           Documentación técnica y configuración
├── design/                 Prototipo de interfaz y decisiones de diseño
└── docs/
    ├── ARQUITECTURA.md     Arquitectura del sistema
    ├── DATOS_DE_PRUEBA.md  Datos ficticios
    └── legacy-n8n/         Los workflows originales, como referencia histórica
```

## Arquitectura

```
Interfaz (React, iPad)  →  API propia  →  Calendar · Drive · Gmail
                                       →  Whisper · pyannote · OpenAI
                                       →  Autoridad de sellado RFC 3161
                                       →  Runachay
                                       →  Base de datos
```

Una sola aplicación, un solo despliegue, un solo dueño de los datos. El detalle
está en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

> El sistema nació como 17 workflows de n8n y se consolidó en servicios propios.
> El motivo y la correspondencia workflow → servicio están en
> [`docs/legacy-n8n/`](docs/legacy-n8n/).

## El acta

El PDF reproduce el formulario **FORMATO ACTA REUNIÓN** del centro: datos
generales, antecedentes, desarrollo, la tabla de acuerdos y compromisos con
responsable y fecha plazo, y el registro de asistencia con las firmas.

No es un detalle estético. Un acta con formato propio obligaría a la docente a
copiarla a mano al formato bueno, y ACTA PRO dejaría de ahorrarle trabajo.

Los antecedentes heredan lo que quedó de la reunión anterior con esa familia,
citando la fecha y el código del acta firmada de la que salen. Lo que el sistema
**no** hace es decir que algo se incumplió: nadie registra eso en ninguna parte,
y afirmarlo en un documento que las dos partes firman sería inventar un hecho.

## Verificación

Seis suites, todas ejecutables sin desplegar nada:

```bash
npm --prefix web run verify:db          # 41 · esquema y adaptador contra PostgreSQL real
npm --prefix web run verify:acta        # 43 · historial y formato institucional
npm --prefix web run verify:alignment   # 20 · quién dijo qué
npm --prefix web run verify:seal        # 18 · sello de integridad
npm --prefix web run verify:tsa -- --red# 20 · sellado RFC 3161, contra la autoridad real
npm --prefix web run verify:marks       # 16 · marcas de la docente
npm --prefix web run verify:auth        # 24 · contraseñas y sesión
npm --prefix web run verify:supabase    # 12 · la base alojada, si la hay
```

## Estado

Interfaz, servicios y persistencia funcionan de principio a fin, y la cadena de
transcripción está comprobada contra una grabación real.

**La persistencia está comprobada contra una base alojada real** (Supabase,
PostgreSQL 17): se firma un acta, se mata el servidor, se levanta otro proceso y
el acta sigue ahí con sus firmas y su sello, que verifica con OpenSSL.

Lo que falta antes de usarlo con reuniones reales:

- **Autoridad de sellado acreditada.** Por defecto apunta a FreeTSA, que
  funciona pero no tiene valor legal en Ecuador. Se cambia con una variable.
- El esquema de respuesta de Runachay sigue sin conocerse, así que el expediente
  académico del estudiante todavía sale de los datos de demostración.

## Privacidad

La aplicación trata datos personales de estudiantes y de sus familias.

- Las credenciales viven solo en el servidor; ninguna variable se expone al
  navegador.
- La transcripción se guarda separada del acta, con permisos propios, y nunca se
  adjunta a un correo.
- Se pide a Google el permiso mínimo: `drive.file` en lugar de `drive`, de modo
  que la aplicación solo ve los archivos que ella misma crea.
- **Cada docente sólo alcanza sus propias reuniones.** No es un filtro de la
  agenda: el servidor devuelve 404 ante la reunión de otro, y 404 y no 403 para
  no confirmar siquiera que existe.
- **No se usan huellas de voz.** Se descartaron a propósito: son datos
  biométricos, y la separación de voces funciona sin ellas porque devuelve
  etiquetas anónimas válidas solo dentro de una grabación.
- Ante un fallo de integración no se elimina ninguna reunión ni información ya
  procesada.
- Todo evento crítico queda registrado en un log de auditoría que solo admite
  inserciones.

## Licencia

Sin licencia definida todavía.
