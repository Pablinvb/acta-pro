import 'server-only';
import PDFDocument from 'pdfkit';
import type {
  Meeting,
  MeetingMinutes,
  Participant,
  Signature,
  SignatureTimestamp,
} from '@/lib/types';
import { getRepositories } from '@/repositories';
import { defaultMeetingPlace, institutionName, institutionTimeZone } from './config';
import { formatSeal, formatSignedAt } from './seal';
import { noEncontrado } from './errors';
import { formatDate, formatShortDate } from './history';
import {
  agreementRows,
  developmentBlocks,
  sequenceFromCode,
  type AgreementRow,
  type RoleHolder,
} from './acta-format';

/**
 * Acta en PDF, con el formato institucional del centro.
 *
 * Antes salía con un formato propio: legible, pero no era **el** acta. Un
 * documento que el centro archiva y que llegado el caso se presenta tiene que
 * ser indistinguible del que ya se usa en papel, o la docente acaba copiándolo
 * a mano al formato bueno y ACTA PRO deja de ahorrarle trabajo.
 *
 * La estructura reproduce «FORMATO ACTA REUNIÓN» de la Unidad Educativa Eight
 * Academy: datos generales, antecedentes, desarrollo, la tabla de acuerdos y
 * compromisos con responsable y fecha plazo, y el registro de asistencia con
 * las firmas.
 *
 * Se genera texto real, no una captura: el PDF queda seleccionable, copiable y
 * buscable. Un acta rasterizada sería inútil para buscar dentro de ella dentro
 * de dos años, que es justo cuando hace falta.
 */

const MARGIN = 42;
const INK = '#000000';
const MUTED = '#444444';
const LINE = '#7f7f7f';
const HEAD_BG = '#d9d9d9';
const LABEL_BG = '#f2f2f2';
const PAD = 5;

/** Lo que se imprime cuando el centro no tiene ese dato registrado. */
const VACIO = '';

/* ── Motor de tablas ──────────────────────────────────────────────────────── */

interface Cell {
  text?: string;
  /** Firma incrustada. Manda sobre el texto. */
  image?: Buffer | null;
  bold?: boolean;
  /** Celda de encabezado o de etiqueta: fondo gris. */
  fill?: string;
  align?: 'left' | 'center';
  size?: number;
}

type Row = Cell[];

/** Alto que necesita una fila para que quepa el contenido de todas sus celdas. */
function rowHeight(
  doc: PDFKit.PDFDocument,
  widths: number[],
  row: Row,
  minHeight: number,
): number {
  let alto = minHeight;
  row.forEach((cell, i) => {
    if (cell.image) return; // la imagen se ajusta al alto, no al revés
    doc.font(cell.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(cell.size ?? 9);
    const h = doc.heightOfString(cell.text ?? '', { width: widths[i] - PAD * 2 }) + PAD * 2;
    if (h > alto) alto = h;
  });
  return alto;
}

/**
 * Dibuja una tabla con saltos de página.
 *
 * Si una fila no cabe entera, empieza en la página siguiente y el encabezado se
 * repite: una tabla de acuerdos cuya cabecera se quedó en la hoja anterior
 * obliga a ir y volver para saber qué columna es cuál.
 */
function table(
  doc: PDFKit.PDFDocument,
  widths: number[],
  rows: Row[],
  options: { minHeight?: number; repeatHeader?: boolean } = {},
): void {
  const minHeight = options.minHeight ?? 18;
  const cabecera = options.repeatHeader ? rows[0] : null;

  const dibujarFila = (row: Row) => {
    const alto = rowHeight(doc, widths, row, minHeight);

    if (doc.y + alto > doc.page.height - MARGIN) {
      doc.addPage();
      if (cabecera && cabecera !== row) dibujarFila(cabecera);
    }

    const y = doc.y;
    let x = MARGIN;

    row.forEach((cell, i) => {
      const w = widths[i];

      doc.rect(x, y, w, alto);
      if (cell.fill) doc.fillColor(cell.fill).fillAndStroke(cell.fill, LINE);
      else doc.strokeColor(LINE).lineWidth(0.6).stroke();

      if (cell.image) {
        try {
          doc.image(cell.image, x + PAD, y + 2, {
            fit: [w - PAD * 2, alto - 4],
            align: 'center',
            valign: 'center',
          });
        } catch {
          // Una firma ilegible no debe impedir que el acta se genere.
        }
      } else if (cell.text) {
        doc
          .font(cell.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(cell.size ?? 9)
          .fillColor(INK)
          .text(cell.text, x + PAD, y + PAD, {
            width: w - PAD * 2,
            align: cell.align ?? 'left',
          });
      }

      x += w;
    });

    doc.y = y + alto;
  };

  for (const row of rows) dibujarFila(row);
}

/** Banda de sección: el título en gris a todo el ancho, como en el formulario. */
function band(doc: PDFKit.PDFDocument, title: string): void {
  const usable = doc.page.width - MARGIN * 2;
  if (doc.y + 40 > doc.page.height - MARGIN) doc.addPage();
  doc.moveDown(0.6);
  table(doc, [usable], [[{ text: title, bold: true, fill: HEAD_BG, align: 'center', size: 10 }]]);
}

/** Bloque etiqueta / contenido a dos columnas, para antecedentes y desarrollo. */
function labelledBlock(
  doc: PDFKit.PDFDocument,
  label: string,
  lines: string[],
  bullet = true,
): void {
  const usable = doc.page.width - MARGIN * 2;
  const etiqueta = usable * 0.26;
  const texto =
    lines.length === 0 ? VACIO : bullet ? lines.map((l) => `•  ${l}`).join('\n') : lines.join('\n');
  table(doc, [etiqueta, usable - etiqueta], [
    [
      { text: label, bold: true, fill: LABEL_BG },
      { text: texto },
    ],
  ], { minHeight: 26 });
}

/** Convierte el data URI del pad de firma en algo que PDFKit pueda incrustar. */
function signatureBuffer(image: string): Buffer | null {
  const comma = image.indexOf(',');
  if (!image.startsWith('data:image/png;base64,') || comma === -1) return null;
  try {
    return Buffer.from(image.slice(comma + 1), 'base64');
  } catch {
    return null;
  }
}

/* ── El acta ──────────────────────────────────────────────────────────────── */

export interface RenderPdfInput {
  meeting: Meeting;
  minutes: MeetingMinutes;
  signatures: Signature[];
  /** Fecha de seguimiento acordada, para la columna «Fecha plazo». */
  followUpDate?: string | null;
}

function datosGenerales(doc: PDFKit.PDFDocument, meeting: Meeting): void {
  const usable = doc.page.width - MARGIN * 2;
  /*
   * El formulario original apila «Correo / Teléfono / Cargo» dentro de una
   * celda combinada. Aquí se despliega en una rejilla de etiqueta y valor con
   * los mismos campos: se conserva todo lo que el formato pide y se lee mejor
   * en un documento generado, donde no hay que dejar hueco para escribir a mano.
   */
  const w = [usable * 0.2, usable * 0.32, usable * 0.2, usable * 0.28];
  const etiqueta = (text: string): Cell => ({ text, bold: true, fill: LABEL_BG });

  const horario = meeting.end_time ?? VACIO;

  table(doc, w, [
    [
      etiqueta('Institución Educativa'),
      { text: institutionName },
      etiqueta('Fecha de Reunión'),
      { text: formatDate(meeting.date) },
    ],
    [
      etiqueta('Responsable del Acta'),
      { text: meeting.teacher_name },
      etiqueta('Correo Electrónico'),
      { text: meeting.teacher_email ?? VACIO },
    ],
    [
      etiqueta('Cargo'),
      { text: meeting.teacher_position ?? VACIO },
      etiqueta('Teléfono'),
      { text: meeting.teacher_phone ?? VACIO },
    ],
    [
      etiqueta('Tema de la Reunión'),
      { text: meeting.meeting_type },
      etiqueta('Hora de Inicio'),
      { text: meeting.start_time },
    ],
    [
      etiqueta('Lugar'),
      { text: meeting.place ?? defaultMeetingPlace },
      etiqueta('Hora de Finalización'),
      { text: horario },
    ],
  ], { minHeight: 22 });
}

/**
 * Quién ocupa cada papel en esta reunión.
 *
 * Permite resolver «la docente registrará la asistencia» sin adivinar: el acta
 * ya sabe quién es la docente y quién representa al estudiante.
 */
function roleHolders(meeting: Meeting): RoleHolder[] {
  const holders: RoleHolder[] = [];
  for (const p of meeting.participants) {
    if (p.role === 'teacher') holders.push({ role: 'teacher', name: p.name });
    else if (p.role === 'mother' || p.role === 'father' || p.role === 'other') {
      holders.push({ role: 'representative', name: p.name });
    } else if (p.role === 'student') holders.push({ role: 'student', name: p.name });
  }
  return holders;
}

function acuerdos(doc: PDFKit.PDFDocument, filas: AgreementRow[]): void {
  const usable = doc.page.width - MARGIN * 2;
  const w = [usable * 0.07, usable * 0.53, usable * 0.22, usable * 0.18];

  const cabecera: Row = [
    { text: 'No.', bold: true, fill: HEAD_BG, align: 'center' },
    { text: 'ACUERDOS Y COMPROMISOS', bold: true, fill: HEAD_BG, align: 'center' },
    { text: 'RESPONSABLE', bold: true, fill: HEAD_BG, align: 'center' },
    { text: 'FECHA PLAZO', bold: true, fill: HEAD_BG, align: 'center' },
  ];

  const cuerpo: Row[] = filas.map((fila, i) => [
    { text: String(i + 1), align: 'center' },
    { text: fila.text },
    { text: fila.responsible },
    { text: fila.dueDate, align: 'center' },
  ]);

  // Una tabla sin filas se imprime igualmente, con una fila vacía: el acta debe
  // enseñar que ese apartado existe y quedó sin acuerdos, no omitirlo.
  table(doc, w, [cabecera, ...(cuerpo.length > 0 ? cuerpo : [[{ text: '1', align: 'center' as const }, {}, {}, {}]])], {
    minHeight: 24,
    repeatHeader: true,
  });
}

function asistencia(
  doc: PDFKit.PDFDocument,
  participants: Participant[],
  signatures: Array<Signature & { image?: string }>,
  meeting: Meeting,
): void {
  const usable = doc.page.width - MARGIN * 2;
  const w = [usable * 0.44, usable * 0.26, usable * 0.3];

  const cabecera: Row = [
    { text: 'NOMBRES Y APELLIDOS', bold: true, fill: HEAD_BG, align: 'center' },
    { text: 'CARGO', bold: true, fill: HEAD_BG, align: 'center' },
    { text: 'FIRMA', bold: true, fill: HEAD_BG, align: 'center' },
  ];

  /** Cargo de cada asistente tal y como debe constar en un acta. */
  const cargo = (p: Participant): string => {
    if (p.role === 'teacher') return meeting.teacher_position ?? 'Docente';
    if (p.role === 'mother') return 'Madre de familia';
    if (p.role === 'father') return 'Padre de familia';
    if (p.role === 'student') return 'Estudiante';
    return 'Representante';
  };

  /*
   * La firma se busca por el papel de la persona: quien firma es la docente y
   * quien representa al estudiante. El estudiante consta en el acta pero no
   * firma, y su casilla queda en blanco.
   *
   * Se prefiere la firma cuyo nombre coincide, pero si no coincide se usa igual
   * la del papel: un acta firmada cuya firma no aparece porque el nombre estaba
   * escrito de otra forma sería un fallo invisible, y precisamente la firma es
   * lo que hace que este documento pruebe algo.
   */
  const firmaDe = (p: Participant): Buffer | null => {
    if (p.role === 'student') return null;
    const rol = p.role === 'teacher' ? 'teacher' : 'representative';
    const delPapel = signatures.filter((s) => s.signer_role === rol && s.signed_at);
    const encontrada = delPapel.find((s) => s.signer_name === p.name) ?? delPapel[0];
    return encontrada ? signatureBuffer(encontrada.image ?? '') : null;
  };

  const presentes = participants.filter((p) => p.present !== false);

  /*
   * Bajo cada firma, cuándo se firmó. Es la mitad visible del sello de tiempo:
   * la otra mitad es la huella que va al pie del documento, y juntas permiten
   * comprobar que el acta archivada es la que se firmó ese día.
   */
  const cuandoFirmo = (p: Participant): string => {
    if (p.role === 'student') return '';
    const rol = p.role === 'teacher' ? 'teacher' : 'representative';
    const delPapel = signatures.filter((s) => s.signer_role === rol && s.signed_at);
    const firma = delPapel.find((s) => s.signer_name === p.name) ?? delPapel[0];
    return firma?.signed_at ? formatSignedAt(firma.signed_at, institutionTimeZone) : '';
  };

  const cuerpo: Row[] = presentes.flatMap((p) => {
    const fecha = cuandoFirmo(p);
    const fila: Row = [{ text: p.name }, { text: cargo(p) }, { image: firmaDe(p) }];
    if (!fecha) return [fila];
    // La hora va en una franja bajo la firma, no dentro: encima de la imagen
    // sería ilegible, y al lado robaría el ancho que la firma necesita.
    return [
      fila,
      [
        { text: '', fill: LABEL_BG },
        { text: '', fill: LABEL_BG },
        { text: `Firmado el ${fecha}`, align: 'center', size: 7, fill: LABEL_BG },
      ] as Row,
    ];
  });

  table(doc, w, [cabecera, ...cuerpo], { minHeight: 42, repeatHeader: true });
}

/**
 * El sello, al final del documento.
 *
 * Se imprime entero y en grupos de ocho para que se pueda cotejar a ojo contra
 * el registro. Y se dice qué demuestra y qué no: un docente que crea tener más
 * respaldo del que tiene está peor protegido que uno que sabe cuál es.
 */
function sello(doc: PDFKit.PDFDocument, hash: string, tsa?: SignatureTimestamp): void {
  const usable = doc.page.width - MARGIN * 2;
  if (doc.y + (tsa ? 100 : 70) > doc.page.height - MARGIN) doc.addPage();
  doc.moveDown(0.8);

  const filas: Row[] = [
    [{ text: 'SELLO DE INTEGRIDAD Y TIEMPO', bold: true, fill: HEAD_BG, align: 'center', size: 8 }],
    [{ text: formatSeal(hash), align: 'center', size: 8.5 }],
  ];

  if (tsa) {
    const quien = tsa.tsa_name ?? tsa.tsa_url ?? 'autoridad de sellado';
    filas.push([
      {
        text:
          `Sellado por ${quien} el ${formatSignedAt(tsa.gen_time, institutionTimeZone)} ` +
          `· serie ${tsa.serial_number}`,
        align: 'center',
        size: 7.5,
      },
    ]);
  }

  table(doc, [usable], filas, { minHeight: 16 });

  /*
   * Se dice exactamente qué respalda el documento. Con sello externo la fecha
   * la atestigua un tercero; sin él, sólo el servidor del centro. Un docente
   * que crea tener más respaldo del que tiene está peor protegido que uno que
   * sabe cuál es, así que la diferencia va impresa.
   */
  const explicacion = tsa
    ? 'Huella SHA-256 del contenido de esta acta y de sus firmas en el momento de firmarla. ' +
      'Cualquier cambio posterior produciría una huella distinta. La fecha está atestiguada por ' +
      'una autoridad de sellado independiente conforme a la norma RFC 3161, no por el propio ' +
      'centro. El token de sellado se conserva junto al acta y permite comprobar ambas cosas ' +
      'ante un tercero.'
    : 'Huella SHA-256 del contenido de esta acta y de sus firmas en el momento de firmarla. ' +
      'Permite comprobar que el documento archivado es exactamente el que se firmó: cualquier ' +
      'cambio posterior produciría una huella distinta. La fecha la registra ACTA PRO y no una ' +
      'autoridad de sellado independiente.';

  doc.moveDown(0.4);
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(MUTED)
    .text(explicacion, MARGIN, doc.y, { width: usable, align: 'justify' });
}

export function renderPdf({
  meeting,
  minutes,
  signatures,
  followUpDate = null,
}: RenderPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: {
        Title: minutes.document_code,
        Author: institutionName,
        Subject: 'Acta de reunión',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const usable = doc.page.width - MARGIN * 2;

    /* Título */
    table(doc, [usable], [
      [
        {
          text: `ACTA DE REUNIÓN Nº ${sequenceFromCode(minutes.document_code)}`,
          bold: true,
          fill: HEAD_BG,
          align: 'center',
          size: 13,
        },
      ],
    ], { minHeight: 28 });

    band(doc, 'DATOS GENERALES');
    datosGenerales(doc, meeting);

    band(doc, 'ANTECEDENTES');
    labelledBlock(
      doc,
      'Antecedentes de la Temática',
      minutes.sections.find((s) => s.number === 3)?.items ?? [],
    );

    band(doc, 'DESARROLLO DE LA REUNIÓN');
    for (const bloque of developmentBlocks(minutes)) {
      labelledBlock(doc, bloque.label, bloque.lines, bloque.bullet);
    }

    band(doc, 'ACUERDOS Y COMPROMISOS');
    acuerdos(
      doc,
      agreementRows(
        minutes,
        followUpDate ? formatShortDate(followUpDate) : '',
        roleHolders(meeting),
      ),
    );

    doc.moveDown(0.8);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(
        'Para constancia de la conformidad de la presente acta y de aceptación de los miembros de la reunión firman los participantes a la reunión.',
        MARGIN,
        doc.y,
        { width: usable, align: 'justify' },
      );

    band(doc, 'REGISTRO DE DATOS Y ASISTENCIA');
    asistencia(doc, meeting.participants, signatures, meeting);

    const huella = signatures.find((s) => s.content_hash)?.content_hash;
    if (huella) sello(doc, huella, signatures.find((s) => s.timestamp)?.timestamp);

    /*
     * Pie con el código en cada página. El «Nº» del encabezado es el número de
     * acta del estudiante, que se repite entre estudiantes; el código es lo
     * único que identifica el documento sin ambigüedad, y hace falta si alguien
     * imprime y se le sueltan las hojas.
     */
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor(MUTED)
        .text(
          `${minutes.document_code}   ·   página ${i - range.start + 1} de ${range.count}`,
          MARGIN,
          doc.page.height - MARGIN + 12,
          { align: 'center', width: usable },
        );
    }

    doc.end();
  });
}

/** Genera el PDF de una reunión concreta. */
export async function build(meetingId: string): Promise<{ pdf: Buffer; documentCode: string }> {
  const repos = getRepositories();

  const meeting = await repos.meetings.find(meetingId);
  if (!meeting) throw noEncontrado(`No existe la reunión ${meetingId}.`);

  const minutes = await repos.minutes.find(meetingId);
  if (!minutes) throw noEncontrado(`No hay acta generada para la reunión ${meetingId}.`);

  const signatures = await repos.signatures.listByMeeting(meetingId);

  /*
   * La fecha plazo se lee del seguimiento guardado y no del texto del acta:
   * es el mismo dato con el que se crea el evento de calendario, así que la
   * tabla y la agenda no pueden decir cosas distintas.
   */
  const followUps = await repos.followUps.listByMeeting(meetingId);
  const followUpDate = followUps.map((f) => f.date).sort()[0] ?? null;

  const pdf = await renderPdf({ meeting, minutes, signatures, followUpDate });

  return { pdf, documentCode: minutes.document_code };
}
