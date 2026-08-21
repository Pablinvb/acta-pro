/**
 * Sellado de tiempo RFC 3161: construcción de la petición y lectura de la
 * respuesta.
 *
 * El sello propio de ACTA PRO demuestra integridad —que el acta archivada es la
 * que se firmó— pero no la fecha frente a un tercero, porque el instante lo
 * pone nuestro servidor. Un sello RFC 3161 sí: una autoridad independiente
 * firma «esta huella existía a esta hora», y eso es lo que convierte un acta en
 * algo que se sostiene en una discusión.
 *
 * Se implementa a mano el ASN.1 que hace falta —DER es un formato pequeño y
 * bien especificado— en lugar de traer una biblioteca de criptografía completa.
 * Lo que **no** se hace a mano es validar la firma del token contra la cadena
 * de certificados de la autoridad: eso es criptografía de verdad y escribirla
 * uno mismo es como se cometen los errores. El token se guarda entero y
 * cualquiera lo verifica con herramientas estándar:
 *
 *     openssl ts -verify -in sello.tsr -data huella.txt -CAfile cadena.pem
 *
 * Lo que sí se comprueba aquí, y es imprescindible, es que la huella sellada
 * por la autoridad sea exactamente la nuestra. Sin esa comprobación se podría
 * archivar un sello legítimo… de otro documento.
 *
 * Módulo puro, sin dependencias ni red, para poder verificarlo sin salir a
 * internet.
 */

/* ── Codificación DER ─────────────────────────────────────────────────────── */

/** Longitud en forma corta (<128) o larga, como exige DER. */
function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return [0x80 | bytes.length, ...bytes];
}

function tlv(tag: number, content: number[]): number[] {
  return [tag, ...derLength(content.length), ...content];
}

/**
 * INTEGER en complemento a dos y mínimo.
 *
 * Si el byte más alto tiene el bit de signo puesto hay que anteponer un cero, o
 * la autoridad leería un número negativo donde va un nonce.
 */
function derInteger(bytes: number[]): number[] {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0 && (bytes[i + 1] & 0x80) === 0) i++;
  const cuerpo = bytes.slice(i);
  return tlv(0x02, (cuerpo[0] & 0x80) !== 0 ? [0, ...cuerpo] : cuerpo);
}

function derIntegerFrom(n: number): number[] {
  const bytes: number[] = [];
  let v = n;
  do {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  } while (v > 0);
  return derInteger(bytes);
}

/** OID en notación de puntos a su codificación base-128. */
export function derOid(oid: string): number[] {
  const arcos = oid.split('.').map(Number);
  const cuerpo: number[] = [arcos[0] * 40 + arcos[1]];
  for (const arco of arcos.slice(2)) {
    const grupo: number[] = [arco & 0x7f];
    let v = Math.floor(arco / 128);
    while (v > 0) {
      grupo.unshift((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    cuerpo.push(...grupo);
  }
  return tlv(0x06, cuerpo);
}

const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_TST_INFO = '1.2.840.113549.1.9.16.1.4';

function hexToBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ── La petición ──────────────────────────────────────────────────────────── */

export interface TimeStampRequestOptions {
  /**
   * Número de un solo uso.
   *
   * La autoridad debe devolverlo idéntico. Es lo que impide que alguien
   * intercepte la respuesta y nos entregue un sello viejo que ya tenía guardado.
   */
  nonce?: number;
  /**
   * Pedir que el token incluya el certificado de la autoridad.
   *
   * Por defecto sí: sin él, el token no se puede verificar sin ir a buscar el
   * certificado a otra parte, y dentro de cinco años esa otra parte puede no
   * existir. Un acta tiene que poder comprobarse sola.
   */
  certReq?: boolean;
  /** Política de sellado exigida, si la autoridad publica varias. */
  policy?: string;
}

/**
 * TimeStampReq (RFC 3161 §2.4.1) con huella SHA-256.
 *
 *   TimeStampReq ::= SEQUENCE {
 *     version        INTEGER { v1(1) },
 *     messageImprint MessageImprint,
 *     reqPolicy      TSAPolicyId OPTIONAL,
 *     nonce          INTEGER OPTIONAL,
 *     certReq        BOOLEAN DEFAULT FALSE }
 */
export function buildTimeStampRequest(
  sha256Hex: string,
  options: TimeStampRequestOptions = {},
): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(sha256Hex)) {
    throw new Error('La huella a sellar debe ser un SHA-256 en hexadecimal.');
  }

  const algoritmo = tlv(0x30, [...derOid(OID_SHA256), 0x05, 0x00]);
  const messageImprint = tlv(0x30, [...algoritmo, ...tlv(0x04, hexToBytes(sha256Hex))]);

  const cuerpo: number[] = [...derIntegerFrom(1), ...messageImprint];
  if (options.policy) cuerpo.push(...derOid(options.policy));
  if (options.nonce !== undefined) cuerpo.push(...derIntegerFrom(options.nonce));
  // `certReq` es DEFAULT FALSE: sólo se codifica cuando es true.
  if (options.certReq !== false) cuerpo.push(0x01, 0x01, 0xff);

  return new Uint8Array(tlv(0x30, cuerpo));
}

/* ── Lectura DER ──────────────────────────────────────────────────────────── */

interface Nodo {
  tag: number;
  /** Dónde empieza la cabecera TLV, no el contenido. */
  cabecera: number;
  /** Dónde empieza el contenido. */
  inicio: number;
  longitud: number;
  /** Dónde empieza el siguiente elemento hermano. */
  fin: number;
}

function leer(buf: Uint8Array, pos: number): Nodo {
  const tag = buf[pos];
  let p = pos + 1;
  let longitud = buf[p++];

  if (longitud & 0x80) {
    const n = longitud & 0x7f;
    if (n === 0) throw new Error('DER de longitud indefinida: no permitido.');
    longitud = 0;
    for (let i = 0; i < n; i++) longitud = longitud * 256 + buf[p++];
  }

  if (p + longitud > buf.length) throw new Error('DER truncado.');
  return { tag, cabecera: pos, inicio: p, longitud, fin: p + longitud };
}

/** Los hijos de un contenedor, en orden. */
function hijos(buf: Uint8Array, nodo: Nodo): Nodo[] {
  const out: Nodo[] = [];
  let p = nodo.inicio;
  while (p < nodo.fin) {
    const hijo = leer(buf, p);
    out.push(hijo);
    p = hijo.fin;
  }
  return out;
}

function enteroDe(buf: Uint8Array, nodo: Nodo): string {
  // Como cadena hexadecimal: los números de serie de una TSA no caben en un
  // `number` y convertirlos perdería dígitos justo en el dato que identifica
  // el sello.
  const bytes = buf.slice(nodo.inicio, nodo.fin);
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytesToHex(bytes.slice(i)).toUpperCase();
}

function oidDe(buf: Uint8Array, nodo: Nodo): string {
  const bytes = buf.slice(nodo.inicio, nodo.fin);
  const arcos: number[] = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let valor = 0;
  for (const b of bytes.slice(1)) {
    valor = valor * 128 + (b & 0x7f);
    if ((b & 0x80) === 0) {
      arcos.push(valor);
      valor = 0;
    }
  }
  return arcos.join('.');
}

/** `20260820212211Z` → `2026-08-20T21:22:11.000Z`. */
export function parseGeneralizedTime(texto: string): string {
  const m = texto.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/);
  if (!m) throw new Error(`GeneralizedTime no reconocido: ${texto}`);
  const [, y, mo, d, h, mi, s, frac] = m;
  const ms = frac ? frac.padEnd(3, '0').slice(0, 3) : '000';
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`;
}

/* ── La respuesta ─────────────────────────────────────────────────────────── */

/** RFC 3161 §2.4.2. */
export const PKI_STATUS: Record<number, string> = {
  0: 'concedido',
  1: 'concedido con modificaciones',
  2: 'rechazado',
  3: 'en espera',
  4: 'aviso de revocación',
  5: 'notificación de revocación',
};

export interface TstInfo {
  policy: string;
  /** Huella que la autoridad ha sellado, en hexadecimal. */
  hashedMessage: string;
  hashAlgorithm: string;
  /** Número de serie del sello, en hexadecimal. */
  serialNumber: string;
  /** Instante atestiguado, en ISO 8601. */
  genTime: string;
  nonce?: string;
  /** Nombre de la autoridad, tal y como viene en el token. Sólo informativo. */
  tsaName?: string;
}

export interface TimeStampResponse {
  status: number;
  statusText: string;
  /** Motivos que da la autoridad cuando rechaza. */
  statusMessages: string[];
  /** Token DER completo: es la prueba, y se guarda tal cual. */
  token?: Uint8Array;
  info?: TstInfo;
}

/** Extrae los textos legibles de un nodo, para los mensajes de estado. */
function textosDe(buf: Uint8Array, nodo: Nodo, salida: string[] = []): string[] {
  // 0x0c UTF8String, 0x13 PrintableString, 0x16 IA5String.
  if (nodo.tag === 0x0c || nodo.tag === 0x13 || nodo.tag === 0x16) {
    salida.push(new TextDecoder().decode(buf.slice(nodo.inicio, nodo.fin)));
    return salida;
  }
  if ((nodo.tag & 0x20) !== 0) {
    for (const hijo of hijos(buf, nodo)) textosDe(buf, hijo, salida);
  }
  return salida;
}

const OID_CN = '2.5.4.3';
const OID_ORG = '2.5.4.10';

/**
 * Nombre de la autoridad, legible.
 *
 * El certificado trae el nombre distinguido entero, y algunas autoridades meten
 * ahí un párrafo de descripción: FreeTSA incluye «This certificate digitally
 * signs documents and time stamp requests made using…». Concatenarlo todo
 * llenaba dos líneas del acta con texto que nadie va a leer. Se busca el nombre
 * común, luego la organización, y sólo si no hay ninguno se recurre al resto.
 */
function nombreDe(buf: Uint8Array, nodo: Nodo): string | undefined {
  const atributos = new Map<string, string>();

  const recorrer = (n: Nodo) => {
    if (n.tag === 0x30) {
      const partes = hijos(buf, n);
      if (partes.length === 2 && partes[0].tag === 0x06) {
        const textos = textosDe(buf, partes[1]);
        if (textos.length > 0) {
          const oid = oidDe(buf, partes[0]);
          if (!atributos.has(oid)) atributos.set(oid, textos[0]);
        }
        return;
      }
    }
    if ((n.tag & 0x20) !== 0) for (const hijo of hijos(buf, n)) recorrer(hijo);
  };
  recorrer(nodo);

  const nombre = atributos.get(OID_CN) ?? atributos.get(OID_ORG);
  if (nombre) {
    const organizacion = atributos.get(OID_ORG);
    // «www.freetsa.org (Free TSA)»: el común identifica, el de organización
    // dice de quién es. Juntos caben en una línea y bastan.
    return organizacion && organizacion !== nombre ? `${nombre} (${organizacion})` : nombre;
  }

  const textos = textosDe(buf, nodo);
  return textos.length > 0 ? textos[0] : undefined;
}

/**
 * Recorre el token CMS hasta el TSTInfo.
 *
 *   ContentInfo → [0] → SignedData → encapContentInfo → [0] → OCTET STRING
 */
function extraerTstInfo(buf: Uint8Array, token: Nodo): TstInfo | undefined {
  const contentInfo = hijos(buf, token);
  if (contentInfo.length < 2 || oidDe(buf, contentInfo[0]) !== OID_SIGNED_DATA) return undefined;

  const signedData = hijos(buf, contentInfo[1])[0];
  if (!signedData) return undefined;

  const partes = hijos(buf, signedData);
  // version, digestAlgorithms, encapContentInfo, …
  const encap = partes[2];
  if (!encap) return undefined;

  const encapPartes = hijos(buf, encap);
  if (encapPartes.length < 2 || oidDe(buf, encapPartes[0]) !== OID_TST_INFO) return undefined;

  const octeto = hijos(buf, encapPartes[1])[0];
  if (!octeto || octeto.tag !== 0x04) return undefined;

  const tst = leer(buf, octeto.inicio);
  const campos = hijos(buf, tst);
  // version, policy, messageImprint, serialNumber, genTime, …
  const messageImprint = hijos(buf, campos[2]);
  const algoritmo = hijos(buf, messageImprint[0])[0];

  const info: TstInfo = {
    policy: oidDe(buf, campos[1]),
    hashAlgorithm: oidDe(buf, algoritmo),
    hashedMessage: bytesToHex(buf.slice(messageImprint[1].inicio, messageImprint[1].fin)),
    serialNumber: enteroDe(buf, campos[3]),
    genTime: parseGeneralizedTime(
      new TextDecoder().decode(buf.slice(campos[4].inicio, campos[4].fin)),
    ),
  };

  for (const campo of campos.slice(5)) {
    if (campo.tag === 0x02) info.nonce = enteroDe(buf, campo);
    // [0] EXPLICIT GeneralName: el nombre de la autoridad.
    if (campo.tag === 0xa0) info.tsaName = nombreDe(buf, campo);
  }

  return info;
}

export function parseTimeStampResponse(der: Uint8Array): TimeStampResponse {
  const raiz = leer(der, 0);
  const partes = hijos(der, raiz);

  const statusInfo = hijos(der, partes[0]);
  const status = Number(parseInt(enteroDe(der, statusInfo[0]) || '0', 16));

  const statusMessages: string[] = [];
  for (const parte of statusInfo.slice(1)) {
    if (parte.tag === 0x30) statusMessages.push(...textosDe(der, parte));
  }

  const respuesta: TimeStampResponse = {
    status,
    statusText: PKI_STATUS[status] ?? `desconocido (${status})`,
    statusMessages,
  };

  if (partes[1]) {
    // El token se guarda entero, con su cabecera TLV, porque así es como lo
    // esperan `openssl ts -verify` y cualquier otro verificador.
    respuesta.token = der.slice(partes[1].cabecera, partes[1].fin);
    respuesta.info = extraerTstInfo(der, partes[1]);
  }

  return respuesta;
}

/**
 * ¿Este sello corresponde a nuestra acta?
 *
 * Es la comprobación que no se puede saltar: un token perfectamente válido de
 * otro documento seguiría verificando contra la autoridad, y archivarlo daría
 * una falsa sensación de respaldo.
 */
export function sealMatches(info: TstInfo, sha256Hex: string): boolean {
  return (
    info.hashAlgorithm === OID_SHA256 &&
    info.hashedMessage.toLowerCase() === sha256Hex.toLowerCase()
  );
}

export { OID_SHA256 };
