/* Accès au modèle de langage (CDC §11) : un seul point d'entrée pour tous les usages de CEA Copilot.
   - Modèle Claude via l'API d'Anthropic (ANTHROPIC_API_KEY ; COPILOT_MODEL pour en changer).
   - Repli côté serveur sur le modèle recommandé si une demande est déclinée par les filtres de sécurité.
   - Chaque appel est inscrit au registre des usages (table ai_usage), sans le contenu échangé.
   Sans clé d'API, askModel renvoie null : chaque usage prévoit alors un repli sans IA. */
import Anthropic from '@anthropic-ai/sdk';
import { db } from './db';
import { aiUsage } from '../db/schema/app';
import { env } from './env';

export const aiModel = () => env('COPILOT_MODEL') || 'claude-opus-5-5';
export const aiEnabled = () => !!env('ANTHROPIC_API_KEY');

let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic({ apiKey: env('ANTHROPIC_API_KEY'), maxRetries: 1 }));

/** Usages déclarés au registre public (/ia). */
export const AI_FEATURES = {
  copilot: 'Assistant conversationnel',
  orientation: 'Orientation',
  redaction: 'Rédaction assistée',
  tuteur: 'Tuteur pédagogique',
  analyse: 'Pré-analyse de dossiers Kapital',
  matching: 'Mise en relation',
  synthese: 'Synthèses',
  moderation: 'Aide à la modération',
} as const;
export type AiFeature = keyof typeof AI_FEATURES;

type Ask = {
  feature: AiFeature;
  userId?: string | null;
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
  timeoutMs?: number;
};

/** Appelle le modèle ; null si l'IA est indisponible, en erreur ou si la demande est déclinée. */
export async function askModel(a: Ask): Promise<Anthropic.Beta.BetaMessage | null> {
  if (!aiEnabled()) return null;
  const model = aiModel();
  let outcome = 'erreur';
  let msg: Anthropic.Beta.BetaMessage | null = null;
  try {
    msg = await getClient().beta.messages.create({
      model,
      max_tokens: a.maxTokens ?? 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: a.effort ?? 'low' },
      system: [{ type: 'text', text: a.system, cache_control: { type: 'ephemeral' } }],
      messages: a.messages,
    }, { timeout: a.timeoutMs ?? 45_000 });
    outcome = msg.stop_reason === 'refusal' ? 'refus' : 'ok';
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.error('[ia] limite de débit atteinte');
    else if (e instanceof Anthropic.APIError) console.error(`[ia] erreur ${e.status} :`, e.message);
    else console.error('[ia] appel impossible :', e instanceof Error ? e.message : e);
  }
  await db.insert(aiUsage).values({
    feature: a.feature, userId: a.userId ?? null, model: msg?.model ?? model, outcome,
    inputTokens: (msg?.usage.input_tokens ?? 0) + (msg?.usage.cache_read_input_tokens ?? 0) + (msg?.usage.cache_creation_input_tokens ?? 0),
    outputTokens: msg?.usage.output_tokens ?? 0,
  }).catch((e) => console.error('[ia] registre :', e instanceof Error ? e.message : e));
  return outcome === 'ok' ? msg : null;
}

/** Texte de la réponse (blocs texte mis bout à bout). */
export const replyText = (m: Anthropic.Beta.BetaMessage) => m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
