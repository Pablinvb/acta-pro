import 'server-only';
import PDFDocument from 'pdfkit';
import type { Meeting, MeetingMinutes, MinutesSection, Signature } from '@/lib/types';
import { getRepositories } from '@/repositories';
import { noEncontrado } from './errors';

/**
 * Acta en PDF.
 *
 * Es el formato de archivo y el que se adjunta al correo, porque un acta es un
 * documento oficial que alguien va a imprimir y guardar en una carpeta física.
 *
 * Se genera texto real, no una captura: el PDF queda seleccionable, copiable y
 * buscable. Un acta rasterizada sería inútil para buscar dentro de ella dentro
 * de dos años, que es justo cuando hace falta.
 *
 * Las firmas se incrustan como imagen. Un acta firmada tiene que enseñar las
 * firmas: sin ellas, el PDF no prueba nada.
 */

const MARGIN = 56;
const INK = '#171b2b';
const MUTED = '#6e7690';
const LINE = '#dde1ec';

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

function renderSection(doc: PDFKit.PDFDocument, section: MinutesSection): void {
  // Si la sección no cabe entera, empieza en la página siguiente: partir un
  // encabezado de su contenido hace el documento difícil de leer.
  if (doc.y > doc.page.height - MARGIN - 90) doc.addPage();

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .fillColor(MUTED)
    .text(`${section.number}. ${section.title.toUpperCase()}`, { characterSpacing: 0.8 });

  doc.moveDown(0.3);
  const y = doc.y;
  doc
    .moveTo(MARGIN, y)
    .lineTo(doc.page.width - MARGIN, y)
    .strokeColor(LINE)
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(0.5);

  doc.font('Helvetica').fontSize(10).fillColor(INK);

  if (section.fields?.length) {
    for (const field of section.fields) {
      doc
        .font('Helvetica')
        .fillColor(MUTED)
        .text(`${field.label}: `, { continued: true })
        .fillColor(INK)
        .text(field.value);
    }
    doc.moveDown(0.4);
  }

  for (const paragraph of section.paragraphs ?? []) {
    doc.fillColor(INK).text(paragraph, { align: 'justify' });
    doc.moveDown(0.4);
  }

  for (const item of section.items ?? []) {
    doc.fillColor(INK).text(`•  ${item}`, {
      align: 'justify',
      indent: 8,
      paragraphGap: 3,
    });
  }

  const empty = !section.fields?.length && !section.paragraphs?.length && !section.items?.length;
  if (empty && section.title !== 'Firmas') {
    doc.fillColor(MUTED).font('Helvetica-Oblique').text('Sin información registrada.');
  }

  doc.moveDown(0.8);
}

function renderSignatures(doc: PDFKit.PDFDocument, signatures: Signature[]): void {
  if (doc.y > doc.page.height - MARGIN - 150) doc.addPage();

  const usable = doc.page.width - MARGIN * 2;
  const columnWidth = (usable - 32) / 2;
  const top = doc.y + 8;

  const column = (
    index: number,
    role: Signature['signer_role'],
    etiqueta: string,
  ) => {
    const x = MARGIN + index * (columnWidth + 32);
    const found = signatures.find((s) => s.signer_role === role && s.signed_at);
    const image = found ? signatureBuffer((found as Signature & { image?: string }).image ?? '') : null;

    if (image) {
      try {
        doc.image(image, x, top, { fit: [columnWidth, 54], align: 'center' });
      } catch {
        // Una firma ilegible no debe impedir que el acta se genere.
      }
    }

    const lineY = top + 60;
    doc.moveTo(x, lineY).lineTo(x + columnWidth, lineY).strokeColor('#c2c9db').lineWidth(0.7).stroke();

    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
    doc.text(found?.signer_name ?? '—', x, lineY + 6, { width: columnWidth });
    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
    doc.text(etiqueta, x, doc.y, { width: columnWidth });

    if (found?.signed_at) {
      doc.fontSize(7).text(
        `Firmado el ${new Date(found.signed_at).toLocaleString('es-EC')}`,
        x,
        doc.y + 1,
        { width: columnWidth },
      );
    } else {
      doc.fontSize(7).text('Pendiente de firma', x, doc.y + 1, { width: columnWidth });
    }
  };

  column(0, 'teacher', 'Docente');
  column(1, 'representative', 'Representante');
}

export interface RenderPdfInput {
  meeting: Meeting;
  minutes: MeetingMinutes;
  signatures: Signature[];
}

export function renderPdf({ minutes, signatures }: RenderPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: minutes.document_code,
        Author: 'ACTA PRO',
        Subject: 'Acta de reunión con representante',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(INK)
      .text('ACTA DE REUNIÓN CON REPRESENTANTE', { align: 'center', characterSpacing: 0.5 });

    doc
      .font('Courier')
      .fontSize(9)
      .fillColor(MUTED)
      .text(minutes.document_code, { align: 'center' });

    doc.moveDown(1.5);

    for (const section of minutes.sections) {
      renderSection(doc, section);
      if (section.title === 'Firmas') renderSignatures(doc, signatures);
    }

    // Pie con el código en cada página: si alguien imprime y se le sueltan las
    // hojas, se sabe a qué acta pertenece cada una.
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
          doc.page.height - MARGIN + 14,
          { align: 'center', width: doc.page.width - MARGIN * 2 },
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
  const pdf = await renderPdf({ meeting, minutes, signatures });

  return { pdf, documentCode: minutes.document_code };
}
