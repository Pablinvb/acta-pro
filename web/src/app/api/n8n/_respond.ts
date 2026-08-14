import 'server-only';
import { NextResponse } from 'next/server';
import { dataSource } from '@/lib/env';
import { N8nNotConfiguredError, N8nRequestError } from '@/lib/n8n';

/**
 * Traduce lo que pase en el cliente de n8n a una respuesta HTTP con un mensaje
 * que una docente pueda entender en mitad de una reunión.
 *
 * Regla heredada de la arquitectura: un fallo de integración nunca destruye
 * información. Ninguna ruta de este directorio borra nada; como mucho informa
 * de que hay que reintentar.
 */
export async function proxy(run: () => Promise<unknown>) {
  if (dataSource === 'mock') {
    return NextResponse.json(
      {
        mocked: true,
        message:
          'La app está en modo demostración. Define ACTA_PRO_DATA_SOURCE=n8n y N8N_WEBHOOK_BASE_URL para enviar a n8n de verdad.',
      },
      { status: 200 },
    );
  }

  try {
    return NextResponse.json(await run());
  } catch (error) {
    if (error instanceof N8nNotConfiguredError) {
      return NextResponse.json({ error: 'n8n_no_configurado', message: error.message }, { status: 503 });
    }
    if (error instanceof N8nRequestError) {
      return NextResponse.json(
        {
          error: 'webhook_fallido',
          message: `n8n rechazó la petición (${error.status}). No se ha perdido nada: vuelve a intentarlo.`,
          detail: error.body.slice(0, 500),
        },
        { status: 502 },
      );
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        {
          error: 'tiempo_agotado',
          message: 'n8n no respondió a tiempo. La información sigue guardada; reintenta en unos segundos.',
        },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { error: 'error_inesperado', message: 'No se pudo contactar con n8n.' },
      { status: 500 },
    );
  }
}
