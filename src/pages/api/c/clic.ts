/* Lien suivi d'un e-mail de campagne (CDC §12, statistiques). GET ?s=<envoi>&l=<numéro du lien>&t=<jeton>
   Redirige vers le n-ième lien du message envoyé (jamais vers une adresse fournie dans la requête : pas de redirection ouverte). */
import type { APIRoute } from 'astro';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { campaign, campaignSend } from '../../../db/schema/crm';
import { validToken, variantOf, linksOf, siteUrl } from '../../../lib/campaigns';

export const prerender = false;

export const GET: APIRoute = async ({ url, redirect }) => {
  const s = url.searchParams.get('s') ?? '', t = url.searchParams.get('t') ?? '', l = Number(url.searchParams.get('l'));
  if (!/^[0-9a-f-]{36}$/.test(s) || !validToken(s, t) || !Number.isInteger(l) || l < 0) return redirect(siteUrl(), 302);
  const [row] = await db.select({ s: campaignSend, c: campaign }).from(campaignSend).innerJoin(campaign, eq(campaign.id, campaignSend.campaignId)).where(eq(campaignSend.id, s));
  const target = row ? linksOf(variantOf(row.c, row.s.variant).body)[l] : undefined;
  if (!row || !target) return redirect(siteUrl(), 302);
  const now = new Date();
  await db.update(campaignSend).set({ clickedAt: now }).where(and(eq(campaignSend.id, s), isNull(campaignSend.clickedAt))).catch(() => {});
  await db.update(campaignSend).set({ openedAt: now }).where(and(eq(campaignSend.id, s), isNull(campaignSend.openedAt))).catch(() => {}); // un clic vaut ouverture (images bloquées)
  return redirect(target, 302);
};
