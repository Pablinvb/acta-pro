/**
 * Verificación del sellado de tiempo RFC 3161.
 *
 * Dos partes. La primera no toca la red: comprueba que la petición que
 * construimos es DER válido byte a byte y que sabemos leer una respuesta. La
 * segunda sale a internet y pide un sello de verdad, porque una petición que
 * parece correcta y que ninguna autoridad acepta no sirve de nada.
 *
 *   npm --prefix web run verify:tsa          sin red
 *   npm --prefix web run verify:tsa -- --red contra la autoridad configurada
 */

import {
  buildTimeStampRequest,
  derOid,
  parseGeneralizedTime,
  parseTimeStampResponse,
  sealMatches,
  OID_SHA256,
} from '../src/services/rfc3161.ts';

let ok = 0;
let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = '') {
  if (condicion) {
    ok++;
    console.log(`  ✓ ${descripcion}`);
  } else {
    fallos++;
    console.log(`  ✗ ${descripcion}${detalle ? `\n      ${detalle}` : ''}`);
  }
}

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const HUELLA = '91bb550633eb2e79a8844ca4f2f3b2f7b9dadca224e93291b74bc4e20e26628e';

console.log('\nACTA PRO · sellado de tiempo RFC 3161\n');

/* ── Codificación ────────────────────────────────────────────────────────── */

console.log('Codificación DER');

comprobar(
  'el OID de SHA-256 se codifica como manda el estándar',
  hex(new Uint8Array(derOid(OID_SHA256))) === '0609608648016503040201',
  hex(new Uint8Array(derOid(OID_SHA256))),
);

comprobar(
  'un OID con arcos grandes usa base 128',
  hex(new Uint8Array(derOid('1.2.840.113549.1.9.16.1.4'))) === '060b2a864886f70d0109100104',
  hex(new Uint8Array(derOid('1.2.840.113549.1.9.16.1.4'))),
);

{
  /*
   * Vector completo, comprobado contra `openssl ts -query`: si un solo byte se
   * desplaza, la autoridad rechaza la petición y sólo se descubriría en
   * producción, con una reunión ya firmada.
   */
  const esperado =
    '303f0201013031300d06096086480165030402010500' +
    `0420${HUELLA}` +
    '0204075bcd150101ff';
  const req = buildTimeStampRequest(HUELLA, { nonce: 123456789, certReq: true });
  comprobar('la petición completa coincide byte a byte', hex(req) === esperado, hex(req));
  comprobar('y mide lo que debe', req.length === 65, String(req.length));
}

{
  const sinNonce = buildTimeStampRequest(HUELLA, { certReq: false });
  // Sin nonce y con `certReq` en su valor por defecto, ninguno de los dos se
  // codifica: DER no admite escribir un DEFAULT explícitamente.
  comprobar(
    'certReq false no se codifica, porque es el valor por defecto',
    !hex(sinNonce).endsWith('0101ff'),
    hex(sinNonce),
  );
}

comprobar(
  'una huella que no es SHA-256 se rechaza antes de salir a la red',
  (() => {
    try {
      buildTimeStampRequest('abc');
      return false;
    } catch {
      return true;
    }
  })(),
);

/* ── Lectura ─────────────────────────────────────────────────────────────── */

console.log('\nLectura de la respuesta');

comprobar(
  'GeneralizedTime a ISO 8601',
  parseGeneralizedTime('20260821015851Z') === '2026-08-21T01:58:51.000Z',
  parseGeneralizedTime('20260821015851Z'),
);
comprobar(
  'con fracción de segundo',
  parseGeneralizedTime('20260821015851.375Z') === '2026-08-21T01:58:51.375Z',
  parseGeneralizedTime('20260821015851.375Z'),
);

{
  /* Rechazo: SEQUENCE { SEQUENCE { INTEGER 2 } } — estado «rejection», sin token. */
  const rechazo = new Uint8Array([0x30, 0x05, 0x30, 0x03, 0x02, 0x01, 0x02]);
  const leida = parseTimeStampResponse(rechazo);
  comprobar('un rechazo se lee como tal', leida.status === 2 && leida.statusText === 'rechazado');
  comprobar('y no trae token', leida.token === undefined);
}

comprobar(
  'un sello de OTRA huella no se da por bueno',
  !sealMatches(
    { policy: '1.2.3', hashAlgorithm: OID_SHA256, hashedMessage: 'ff'.repeat(32), serialNumber: '1', genTime: '2026-08-21T00:00:00.000Z' },
    HUELLA,
  ),
  'un token legítimo de otro documento verificaría igual: archivarlo daría un respaldo falso',
);

comprobar(
  'un sello con otro algoritmo tampoco',
  !sealMatches(
    { policy: '1.2.3', hashAlgorithm: '1.3.14.3.2.26', hashedMessage: HUELLA, serialNumber: '1', genTime: '2026-08-21T00:00:00.000Z' },
    HUELLA,
  ),
);

comprobar(
  'el sello correcto sí',
  sealMatches(
    { policy: '1.2.3', hashAlgorithm: OID_SHA256, hashedMessage: HUELLA.toUpperCase(), serialNumber: '1', genTime: '2026-08-21T00:00:00.000Z' },
    HUELLA,
  ),
);

/* ── Contra la autoridad de verdad ───────────────────────────────────────── */

if (process.argv.includes('--red')) {
  const url = process.env.ACTA_PRO_TSA_URL ?? 'https://freetsa.org/tsr';
  console.log(`\nContra la autoridad (${url})`);

  const nonce = Math.floor(Math.random() * 0xffffffff);
  const peticion = buildTimeStampRequest(HUELLA, { nonce, certReq: true });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/timestamp-query' },
      body: new Uint8Array(peticion),
      signal: AbortSignal.timeout(20000),
    });

    comprobar('la autoridad responde', res.ok, `HTTP ${res.status}`);
    comprobar(
      'con el tipo de contenido correcto',
      (res.headers.get('content-type') ?? '').includes('timestamp-reply'),
      res.headers.get('content-type') ?? '(ninguno)',
    );

    const leida = parseTimeStampResponse(new Uint8Array(await res.arrayBuffer()));
    comprobar('concede el sello', leida.status === 0, `${leida.statusText} ${leida.statusMessages.join(' ')}`);
    comprobar('devuelve un token', (leida.token?.length ?? 0) > 100, `${leida.token?.length ?? 0} bytes`);
    comprobar('sella nuestra huella y no otra', !!leida.info && sealMatches(leida.info, HUELLA));
    comprobar(
      'devuelve el nonce que enviamos',
      leida.info?.nonce !== undefined && parseInt(leida.info.nonce, 16) === nonce,
      `enviado ${nonce}, recibido ${leida.info?.nonce}`,
    );
    comprobar(
      'la fecha atestiguada es de ahora',
      !!leida.info && Math.abs(Date.parse(leida.info.genTime) - Date.now()) < 5 * 60 * 1000,
      leida.info?.genTime,
    );
    if (leida.info) {
      console.log(`      autoridad: ${leida.info.tsaName ?? '(sin nombre)'}`);
      console.log(`      serie: ${leida.info.serialNumber} · política: ${leida.info.policy}`);
    }
  } catch (error) {
    comprobar('la autoridad responde', false, (error as Error).message);
  }
} else {
  console.log('\n(Añade `-- --red` para probar contra la autoridad configurada.)');
}

console.log(`\n${ok} comprobaciones correctas, ${fallos} fallidas\n`);

/*
 * `process.exitCode` en lugar de `process.exit()`: con la prueba de red, salir
 * de golpe mientras el socket sigue cerrándose hace que libuv escupa un aviso
 * de aserción en Windows. Un script de verificación que termina con un error
 * aparente no sirve, porque enseña a ignorar sus propios avisos.
 */
process.exitCode = fallos === 0 ? 0 : 1;
