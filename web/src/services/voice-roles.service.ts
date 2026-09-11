import 'server-only';
import { z } from 'zod';
import { getRepositories } from '@/repositories';
import * as audit from './audit.service';
import { isDemo, openaiModel } from './config';
import { noEncontrado } from './errors';
import { openai } from './openai.client';
import {
  anonymousTranscript,
  resolveSuggestions,
  SYSTEM_PROMPT,
  type RoleGuess,
  type VoiceSuggestion,
} from './voice-roles';

/**
 * Sugerencia de quién es cada voz.
 *
 * Cierra el paso del diagrama que faltaba: «Modelo LLM → identificar rol de
 * cada uno → DOCENTE / PADRE / ESTUDIANTE». Pero lo cierra como sugerencia, no
 * como decisión: la docente sigue confirmando.
 *
 * **Nunca bloquea.** Si el modelo no responde, o responde algo que no se
 * sostiene, la pantalla de identificación funciona exactamente como antes. Las
 * sugerencias son una ayuda; perder la ayuda no puede costar la reunión.
 */

const guessSchema = z.object({
  asignaciones: z
    .array(
      z.object({
        voz: z.string(),
        rol: z.enum(['docente', 'representante', 'estudiante', 'desconocido']),
        confianza: z.enum(['alta', 'media', 'baja']).default('baja'),
        evidencia: z.string().default(''),
      }),
    )
    .default([]),
});

/** En demostración no se llama a nadie: la propuesta sale de los propios datos. */
function demoGuesses(transcript: string): RoleGuess[] {
  const linea = (prefijo: string) =>
    transcript
      .split('\n')
      .find((l) => l.startsWith(prefijo))
      ?.slice(prefijo.length)
      .trim() ?? '';

  return [
    { voz: 'A', rol: 'docente', confianza: 'alta', evidencia: linea('Voz A:') },
    { voz: 'B', rol: 'representante', confianza: 'alta', evidencia: linea('Voz B:') },
  ];
}

export async function suggest(meetingId: string): Promise<VoiceSuggestion[]> {
  const repos = getRepositories();

  const meeting = await repos.meetings.find(meetingId);
  if (!meeting) throw noEncontrado(`No existe la reunión ${meetingId}.`);

  const segments = await repos.transcripts.listByMeeting(meetingId);
  const transcript = anonymousTranscript(segments);

  // Sin voces separadas no hay nada que proponer.
  if (transcript.length === 0) return [];

  const guesses = isDemo ? demoGuesses(transcript) : await callModel(transcript);
  const suggestions = resolveSuggestions(guesses, meeting.participants, transcript);

  await audit.record({
    meetingId,
    service: 'voice-roles',
    event:
      `roles propuestos (${isDemo ? 'demostración' : openaiModel}): ` +
      (suggestions.length === 0
        ? 'ninguna propuesta se sostiene; la docente identifica sin ayuda'
        : suggestions.map((s) => `${s.speaker_tag}=${s.name}`).join(', ')),
  });

  return suggestions;
}

async function callModel(transcript: string): Promise<RoleGuess[]> {
  let raw: string;
  try {
    const completion = await openai().chat.completions.create({
      model: openaiModel,
      // Cero: la misma reunión debe proponer siempre lo mismo. Una sugerencia
      // que cambia entre recargas no se puede contrastar con nada.
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? '';
  } catch (error) {
    // No se propaga: quedarse sin sugerencia es perder una comodidad, y la
    // pantalla funciona igual. Se registra para poder saber que faltó.
    console.error('[acta-pro] no se pudieron proponer roles de voz:', error);
    return [];
  }

  try {
    const parsed = guessSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.asignaciones : [];
  } catch {
    return [];
  }
}
