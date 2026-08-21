import { readFile } from 'node:fs/promises';

/**
 * Lectura de `.env.local` con las mismas reglas que usa Next.
 *
 * Existe por un fallo que costó una sesión entera de depuración. Los scripts
 * llevaban cada uno su propio bucle con `if (!process.env[clave])`, es decir,
 * **la primera aparición ganaba**. Next usa dotenv, donde **gana la última**.
 *
 * El archivo tenía `ACTA_PRO_PERSISTENCE` dos veces: `postgres` arriba y
 * `memory` al final. La comprobación de la base decía que todo estaba conectado
 * —leía la primera— mientras la aplicación guardaba en memoria y lo perdía todo
 * al reiniciar. Un verificador que lee la configuración de forma distinta a la
 * aplicación no es que no ayude: miente con autoridad.
 *
 * Las variables reales del entorno siguen ganando sobre el archivo, que es
 * también lo que hace Next.
 */

export interface EnvCargado {
  /** Claves definidas más de una vez en el archivo. Sólo vale la última. */
  duplicadas: string[];
}

export async function cargarEnv(desde: URL): Promise<EnvCargado> {
  let contenido: string;
  try {
    contenido = await readFile(desde, 'utf8');
  } catch {
    return { duplicadas: [] };
  }

  const valores = new Map<string, string>();
  const duplicadas = new Set<string>();

  for (const linea of contenido.split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    if (valores.has(m[1])) duplicadas.add(m[1]);
    // Sin condición: la última aparición sustituye a la anterior, como dotenv.
    valores.set(m[1], m[2].replace(/^["']|["']$/g, ''));
  }

  for (const [clave, valor] of valores) {
    // El entorno real manda sobre el archivo, igual que en Next.
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }

  return { duplicadas: [...duplicadas] };
}
