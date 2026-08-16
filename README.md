# ACTA PRO

**Aplicación para que los docentes documenten sus reuniones con representantes
sin que el acta se vuelva en su contra.**

ACTA PRO cubre el ciclo completo de una reunión escolar: detecta la cita en
Google Calendar, prepara la ficha del estudiante, graba y transcribe la reunión,
analiza la conversación con IA, redacta el acta, señala la redacción que podría
comprometer al docente, recoge las firmas de ambas partes, archiva el documento
y lo envía al representante.

## Qué lo hace distinto

La parte interesante no es la automatización, es **la protección documental**.

Un acta que dice «la madre se muestra despreocupada» es un juicio de valor que
puede volverse contra quien la firmó. ACTA PRO revisa cada fragmento antes de
firmar, lo clasifica como adecuado / a revisar / no recomendado, y propone una
redacción objetiva. **La IA solo sugiere**: nunca cambia una palabra sin decisión
explícita de la docente, y el sistema se niega a aprobar un acta que conserve
fragmentos no recomendados sin resolver.

## Arrancar

```bash
npm --prefix web install
npm --prefix web run dev
```

http://localhost:3000 · usuario `T-045`, contraseña `acta-pro-demo`.

Sin configurar nada arranca en **modo demostración**: se puede recorrer el ciclo
completo con datos ficticios, sin Google, sin OpenAI, sin Runachay y sin base de
datos.

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
Interfaz (React, iPad)  →  API propia  →  Calendar · Drive · Gmail · OpenAI · Runachay
                                       →  Base de datos
```

Una sola aplicación, un solo despliegue, un solo dueño de los datos. El detalle
está en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

> El sistema nació como 17 workflows de n8n y se consolidó en servicios propios.
> El motivo y la correspondencia workflow → servicio están en
> [`docs/legacy-n8n/`](docs/legacy-n8n/).

## Estado

Interfaz, servicios y persistencia en memoria funcionan de principio a fin. Lo
que falta antes de usarlo con reuniones reales:

- Adaptador de PostgreSQL (el esquema ya está definido).
- Verificar las integraciones de Google y OpenAI contra las APIs reales.
- Almacén de usuarios: hoy la autenticación usa una contraseña compartida.
- El esquema de respuesta de Runachay sigue sin conocerse.

## Privacidad

La aplicación trata datos personales de menores.

- Las credenciales viven solo en el servidor; ninguna variable se expone al
  navegador.
- La transcripción se guarda separada del acta, con permisos propios, y nunca se
  adjunta a un correo.
- Ante un fallo de integración no se elimina ninguna reunión ni información ya
  procesada.
- Todo evento crítico queda registrado en un log de auditoría que solo admite
  inserciones.

## Licencia

Sin licencia definida todavía.
