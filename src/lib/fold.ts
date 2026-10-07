/* Recherche tolérante côté base de données (complète src/lib/fuzzy.ts, qui travaille sur des listes en mémoire) :
   insensible aux majuscules et aux accents, mots dans n'importe quel ordre (« agbodjan aicha » trouve « Aïcha Agbodjan »),
   numéros de téléphone comparés chiffre à chiffre.
   - foldSql(colonne) : la normalisation de fuzzy.norm côté PostgreSQL (sans extension) ;
   - matchAll(champs, requête) : condition SQL « chaque mot de la requête figure dans l'un des champs » ;
   - anyPrefix(champs, requête) : condition large (un mot commence pareil), pour présélectionner avant un classement tolérant aux fautes. */
import { and, or, sql, type SQL, type AnyColumn } from 'drizzle-orm';
import { norm } from './fuzzy';

export const fold = norm;

const ACC = 'àáâãäåāăąçćčďèéêëēėęěìíîïīįñńňòóôõöøōőùúûüūůűýÿžźżšśřţťłđ';
const PLAIN = 'aaaaaaaaacccdeeeeeeeeiiiiiinnnoooooooouuuuuuuyyzzzssrttld'; // même longueur que ACC (57)
export const foldSql = (col: AnyColumn | SQL) => sql`translate(lower(coalesce(${col}, '')), ${ACC}, ${PLAIN})`;

/** Mots de la requête (au plus 6), simplifiés ; les jokers SQL sont retirés. */
export const words = (q: string) => fold(q).replace(/[%_\\]/g, '').split(/[\s,;'’"()]+/).filter((w) => w.length > 0).slice(0, 6);

/** Au moins un mot de 3 lettres ou plus dont le début figure dans l'un des champs (présélection pour les fautes de frappe). */
export function anyPrefix(text: (AnyColumn | SQL)[], q: string): SQL | undefined {
  const ws = words(q).filter((w) => w.length >= 3);
  if (!ws.length) return undefined;
  const hay = sql.join(text.map((c) => foldSql(c)), sql` || ' ' || `);
  return or(...ws.map((w) => sql`(${hay}) like ${'%' + w.slice(0, 3) + '%'}`));
}

/** Chaque mot doit figurer dans l'un des champs texte, ou (s'il contient des chiffres) dans le téléphone réduit à ses chiffres. */
export function matchAll(text: (AnyColumn | SQL)[], q: string, phone?: AnyColumn): SQL | undefined {
  const ws = words(q);
  if (!ws.length) return undefined;
  const hay = sql.join(text.map((c) => foldSql(c)), sql` || ' ' || `);
  return and(...ws.map((w) => {
    const digits = w.replace(/\D/g, '');
    const inText = sql`(${hay}) like ${'%' + w + '%'}`;
    return phone && digits.length >= 2 && digits.length >= w.replace(/[+.\-]/g, '').length
      ? sql`(${inText} or regexp_replace(coalesce(${phone}, ''), '\\D', '', 'g') like ${'%' + digits + '%'})`
      : inText;
  }));
}
