import type { FollowUp, Meeting, MeetingMinutes } from '@/lib/types';

/**
 * Resumen del historial de un estudiante.
 *
 * Módulo puro, sin acceso a datos, para poder verificarlo sin base ni servidor.
 * Toda la política de qué se considera «pendiente» vive aquí, en un solo sitio,
 * porque es una decisión delicada: el acta se puede acabar usando en una
 * discusión entre una familia y el centro.
 */

/** Números de sección fijados por la arquitectura. Se indexa por número y no
 *  por título porque el número es lo que el contrato garantiza. */
const SECCION_ACUERDOS = 7;
const SECCION_COMPROMISOS = 8;
const SECCION_RESPONSABLES = 9;

export interface PastMeeting {
  meetingId: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  meetingType: string;
  documentCode: string | null;
  agreements: string[];
  commitments: string[];
  responsibles: string[];
  /** Fecha de seguimiento acordada, si la hubo. */
  followUpDate: string | null;
  followUpDescription: string | null;
}

export interface PendingItem {
  text: string;
  kind: 'acuerdo' | 'compromiso';
  fromMeetingId: string;
  /** Fecha de la reunión donde se acordó. */
  fromDate: string;
  documentCode: string | null;
  /**
   * La fecha de seguimiento acordada ya pasó.
   *
   * **No significa incumplido.** Significa que llegó la fecha y no consta otra
   * reunión. Puede haberse cumplido perfectamente sin que nadie lo registrara.
   */
  overdue: boolean;
  dueDate: string | null;
}

export interface StudentHistory {
  /** De la más reciente a la más antigua. */
  meetings: PastMeeting[];
  /** La anterior a la reunión actual, que es la que casi siempre importa. */
  last: PastMeeting | null;
  /**
   * Lo que quedó abierto en la última reunión.
   *
   * Sólo de la última, deliberadamente. Un acuerdo de marzo que ya se retomó en
   * junio no está «pendiente»: se habló de él. Arrastrar todo el curso llenaría
   * la pantalla de cosas resueltas y la docente dejaría de leerla, que es la
   * forma más segura de que se le escape la que sí importaba.
   */
  pending: PendingItem[];
  /** Cuántas reuniones previas hay en total. */
  count: number;
}

function itemsOf(minutes: MeetingMinutes | null, number: number): string[] {
  const seccion = minutes?.sections.find((s) => s.number === number);
  return (seccion?.items ?? []).map((i) => i.trim()).filter((i) => i.length > 0);
}

export interface HistoryRecord {
  meeting: Meeting;
  minutes: MeetingMinutes | null;
  followUps: FollowUp[];
}

export function summarise(records: HistoryRecord[], today: string): StudentHistory {
  const meetings: PastMeeting[] = records
    .map(({ meeting, minutes, followUps }) => {
      // El seguimiento más lejano es el que marca hasta cuándo sigue viva la
      // reunión: si se acordaron dos revisiones, la reunión no está cerrada
      // hasta que pasa la última.
      const fechas = followUps.map((f) => f.date).sort();
      const ultimo = fechas.length > 0 ? fechas[fechas.length - 1] : null;
      const descripcion = followUps.find((f) => f.date === ultimo)?.description ?? null;

      return {
        meetingId: meeting.meeting_id,
        date: meeting.date,
        meetingType: meeting.meeting_type,
        documentCode: minutes?.document_code ?? null,
        agreements: itemsOf(minutes, SECCION_ACUERDOS),
        commitments: itemsOf(minutes, SECCION_COMPROMISOS),
        responsibles: itemsOf(minutes, SECCION_RESPONSABLES),
        followUpDate: ultimo,
        followUpDescription: descripcion,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const last = meetings[0] ?? null;

  /*
   * «Vencido» se decide sólo con la fecha, y sólo si no hubo ninguna reunión
   * posterior: si la hubo, el asunto ya volvió a la mesa y decir que sigue
   * vencido sería falso.
   */
  const overdue =
    last?.followUpDate !== null &&
    last?.followUpDate !== undefined &&
    last.followUpDate < today;

  const pending: PendingItem[] = last
    ? [
        ...last.agreements.map((text) => ({ text, kind: 'acuerdo' as const })),
        ...last.commitments.map((text) => ({ text, kind: 'compromiso' as const })),
      ].map(({ text, kind }) => ({
        text,
        kind,
        fromMeetingId: last.meetingId,
        fromDate: last.date,
        documentCode: last.documentCode,
        overdue,
        dueDate: last.followUpDate,
      }))
    : [];

  return { meetings, last, pending, count: meetings.length };
}

/**
 * Los antecedentes que hereda una reunión nueva, redactados para el acta.
 *
 * Van con la fecha y el código del acta de la que salen, porque un antecedente
 * sin procedencia es una afirmación sin respaldo: si alguien discute el acta,
 * esta línea tiene que llevar a un documento firmado.
 */
export function inheritedBackground(history: StudentHistory): string[] {
  if (!history.last) return [];

  const fecha = formatDate(history.last.date);
  const referencia = history.last.documentCode ? ` (${history.last.documentCode})` : '';

  const lineas = history.last.agreements.map(
    (a) => `En la reunión del ${fecha}${referencia} se acordó: ${a}`,
  );
  lineas.push(
    ...history.last.commitments.map(
      (c) => `En la reunión del ${fecha}${referencia} se registró el compromiso: ${c}`,
    ),
  );

  if (history.last.followUpDate) {
    lineas.push(
      `El seguimiento de esa reunión estaba previsto para el ${formatDate(history.last.followUpDate)}.`,
    );
  }

  return lineas;
}

/**
 * `2026-08-14` → `14/08/2026`.
 *
 * Para las casillas estrechas de la tabla del acta, donde la fecha escrita se
 * parte en tres líneas y deja la columna ilegible.
 */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** `2026-08-14` → `14 de agosto de 2026`. */
export function formatDate(iso: string): string {
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const [y, m, d] = iso.split('-');
  const mes = meses[Number(m) - 1];
  if (!mes || !d || !y) return iso;
  return `${Number(d)} de ${mes} de ${y}`;
}
