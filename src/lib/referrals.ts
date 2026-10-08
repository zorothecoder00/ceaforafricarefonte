/* Parrainage (CDC §7.8, V2) : lien personnel /?parrain=CODE, mémorisé 30 jours par un cookie puis rattaché au compte créé
   (dans les 7 jours suivant sa création) ; le filleul devient « actif » quand il complète son profil (titre et pays) ou
   valide une première leçon : le parrain reçoit alors 50 points, le filleul 20. */
import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { referral, referralCode } from '../db/schema/app';
import { user } from '../db/schema/auth';
import { award } from './points';
import { notify } from './notify';

export const REF_COOKIE = 'cea-parrain';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join('');
export const validCode = (c: string) => /^[A-Z2-9]{6}$/.test(c);

export async function codeFor(userId: string) {
  const [r] = await db.select({ code: referralCode.code }).from(referralCode).where(eq(referralCode.userId, userId));
  if (r) return r.code;
  for (let i = 0; i < 5; i++) {
    const [ins] = await db.insert(referralCode).values({ userId, code: newCode() }).onConflictDoNothing().returning({ code: referralCode.code });
    if (ins) return ins.code;
    const [again] = await db.select({ code: referralCode.code }).from(referralCode).where(eq(referralCode.userId, userId));
    if (again) return again.code;
  }
  throw new Error('Code de parrainage indisponible');
}

/** Rattache un compte récent à son parrain ; sans effet si le compte a plus de 7 jours, a déjà un parrain ou s'auto-parraine. */
export async function attachReferral(refereeId: string, code: string) {
  if (!validCode(code)) return false;
  const [owner] = await db.select({ id: referralCode.userId }).from(referralCode).where(eq(referralCode.code, code));
  if (!owner || owner.id === refereeId) return false;
  const [me] = await db.select({ createdAt: user.createdAt, name: user.name }).from(user).where(eq(user.id, refereeId));
  if (!me || Date.now() - me.createdAt.getTime() > 7 * 864e5) return false;
  const [ins] = await db.insert(referral).values({ refereeId, referrerId: owner.id }).onConflictDoNothing().returning();
  if (ins) await notify(owner.id, `${me.name} a rejoint CEA FOR AFRICA grâce à votre lien de parrainage.`, '/communaute/parrainage');
  return !!ins;
}

/** Filleuls devenus actifs : points et notification (appelé chaque jour par le cron). */
export async function qualifyReferrals() {
  const rows = await db.update(referral).set({ qualifiedAt: new Date() }).where(and(isNull(referral.qualifiedAt), sql`(
      exists (select 1 from profile p where p.user_id = ${referral.refereeId} and coalesce(p.headline, '') <> '' and p.country is not null)
      or exists (select 1 from enrollment e where e.user_id = ${referral.refereeId} and cardinality(e.completed_lessons) > 0))`)).returning();
  for (const r of rows) {
    await award(r.referrerId, 'parrainage', r.refereeId);
    await award(r.refereeId, 'filleul', r.referrerId);
    const [f] = await db.select({ name: user.name }).from(user).where(eq(user.id, r.refereeId));
    await notify(r.referrerId, `Votre filleul ${f?.name ?? ''} est devenu actif : +50 points de contribution.`, '/communaute/parrainage');
  }
  return rows.length;
}

export async function referralsOf(userId: string) {
  return db.select({ id: referral.refereeId, name: user.name, createdAt: referral.createdAt, qualifiedAt: referral.qualifiedAt }).from(referral)
    .innerJoin(user, eq(user.id, referral.refereeId)).where(eq(referral.referrerId, userId)).orderBy(desc(referral.createdAt));
}
