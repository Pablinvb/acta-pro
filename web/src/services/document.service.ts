import 'server-only';
import type { ArchivedDocument, MeetingMinutes, Signature } from '@/lib/types';
import { getRepositories } from '@/repositories';
import type { DocumentSearch } from '@/repositories/types';
import { noEncontrado } from './errors';

/**
 * Documento final — antes workflow 13.
 *
 * Convierte el acta aprobada y firmada en el HTML definitivo, que es lo que se
 * archiva en Drive y se adjunta al correo.
 *
 * Se escapa todo lo que venga de la transcripción o del análisis. Ese texto
 * procede de audio transcrito por un modelo y no es de fiar como HTML: sin
 * escapar, una frase con `<` en mitad de una reunión rompería el documento, y
 * en el peor caso inyectaría marcado en algo que va a leer un representante.
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function renderSection(section: MeetingMinutes['sections'][number]): string {
  const parts: string[] = [
    `<h2>${section.number}. ${escape(section.title)}</h2>`,
  ];

  if (section.fields?.length) {
    parts.push(
      '<dl class="datos">' +
        section.fields
          .map((f) => `<dt>${escape(f.label)}</dt><dd>${escape(f.value)}</dd>`)
          .join('') +
        '</dl>',
    );
  }

  section.paragraphs?.forEach((p) => parts.push(`<p>${escape(p)}</p>`));

  if (section.items?.length) {
    parts.push('<ul>' + section.items.map((i) => `<li>${escape(i)}</li>`).join('') + '</ul>');
  }

  const empty =
    !section.fields?.length && !section.paragraphs?.length && !section.items?.length;
  if (empty && section.title !== 'Firmas') {
    parts.push('<p class="vacio">Sin información registrada.</p>');
  }

  return parts.join('\n');
}

function renderSignatures(signatures: Signature[]): string {
  const block = (role: Signature['signer_role'], etiqueta: string) => {
    const s = signatures.find((x) => x.signer_role === role);
    if (!s?.signed_at) {
      return `<div class="firma"><span class="linea"></span><p>${etiqueta} — pendiente de firma</p></div>`;
    }
    return `<div class="firma">
      <span class="linea"></span>
      <p>${escape(s.signer_name)} — ${etiqueta}</p>
      <p class="sello">Firmado el ${escape(new Date(s.signed_at).toLocaleString('es-EC'))}</p>
    </div>`;
  };
  return `<div class="firmas">${block('teacher', 'Docente')}${block('representative', 'Representante')}</div>`;
}

const STYLES = `
  body { font-family: Georgia, 'Times New Roman', serif; color: #171b2b; line-height: 1.6;
         max-width: 720px; margin: 0 auto; padding: 48px 32px; }
  h1 { font-size: 20px; text-align: center; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
  .codigo { text-align: center; font-family: ui-monospace, monospace; font-size: 11px; color: #6e7690; margin-bottom: 32px; }
  h2 { font-family: system-ui, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: .09em;
       text-transform: uppercase; color: #6e7690; border-bottom: 1px solid #dde1ec;
       padding-bottom: 5px; margin: 24px 0 8px; }
  dl.datos { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; font-family: system-ui, sans-serif; font-size: 13px; }
  dt { color: #6e7690; } dd { margin: 0; }
  ul { padding-left: 20px; } li { margin-bottom: 6px; }
  .vacio { color: #6e7690; font-style: italic; }
  .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 16px; }
  .firma .linea { display: block; border-top: 1px solid #c2c9db; margin-bottom: 8px; padding-top: 32px; }
  .firma p { font-family: system-ui, sans-serif; font-size: 12px; margin: 0; }
  .sello { color: #6e7690; font-size: 10px; margin-top: 2px; }
`;

export function renderHtml(minutes: MeetingMinutes, signatures: Signature[]): string {
  const body = minutes.sections
    .map((s) => (s.title === 'Firmas' ? `${renderSection(s)}\n${renderSignatures(signatures)}` : renderSection(s)))
    .join('\n');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escape(minutes.document_code)}</title>
<style>${STYLES}</style>
</head>
<body>
<h1>Acta de reunión con representante</h1>
<p class="codigo">${escape(minutes.document_code)}</p>
${body}
</body>
</html>`;
}

/** Genera el documento final de una reunión ya firmada. */
/**
 * Actas archivadas, con los mismos filtros que el repositorio.
 *
 * Existe para que las pantallas no tengan que alcanzar el repositorio por su
 * cuenta: si algún día el archivo deja de ser una tabla, hay un solo sitio que
 * cambiar.
 */
export async function search(criteria: DocumentSearch = {}): Promise<ArchivedDocument[]> {
  return getRepositories().documents.search(criteria);
}

export async function build(meetingId: string): Promise<{ html: string; documentCode: string }> {
  const repos = getRepositories();
  const minutes = await repos.minutes.find(meetingId);
  if (!minutes) throw noEncontrado(`No hay acta para la reunión ${meetingId}.`);

  const signatures = await repos.signatures.listByMeeting(meetingId);
  return { html: renderHtml(minutes, signatures), documentCode: minutes.document_code };
}
