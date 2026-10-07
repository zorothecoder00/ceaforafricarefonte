/* CEA OS — gestion : agent de rapprochement des encaissements (prototype › sugg). Pour chaque encaissement reçu, propose la
   facture correspondante : référence identique (98 %), montant unique identique (72 %), plusieurs factures du même montant (45 %). */
import type { osReceipt } from '../../db/schema/os';
import type { invoice } from '../../db/schema/finance';

type Rec = typeof osReceipt.$inferSelect;
type Inv = typeof invoice.$inferSelect;
export function suggest(r: Rec, unpaid: Inv[]): { inv: Inv; why: string; score: number } | null {
  const ref = r.ref.toUpperCase();
  const ex = ref ? unpaid.find((i) => ref.includes(i.number.toUpperCase())) : undefined;
  if (ex) return { inv: ex, why: 'Référence identique', score: 98 };
  const am = unpaid.filter((i) => i.totalXof === r.amount);
  if (am.length === 1) return { inv: am[0], why: 'Montant identique', score: 72 };
  if (am.length) return { inv: am[0], why: `${am.length} factures du même montant`, score: 45 };
  return null;
}
