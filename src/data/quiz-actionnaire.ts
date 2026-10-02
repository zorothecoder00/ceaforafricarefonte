/* Quiz « Actionnaire averti » (CDC §7.1). La bonne réponse (« ok ») n'est jamais envoyée au navigateur :
   la correction se fait côté serveur (/api/actionnariat/quiz), qui délivre le certificat vérifiable. */
export const QUIZ_SUBJECT = 'quiz-actionnaire';
export const QUIZ_TITLE = 'Certificat « Actionnaire averti »';
export const QUIZ_PASS = 3;

export const QUIZ: { q: string; opts: string[]; ok: number }[] = [
  { q: 'Si une entreprise émet de nouvelles actions, le pourcentage des associés existants…', opts: ['Augmente', 'Baisse (dilution)', 'Reste identique'], ok: 1 },
  { q: 'Un dividende est…', opts: ['Un prêt', 'Un impôt', 'Une part des bénéfices distribuée'], ok: 2 },
  { q: 'La valorisation post-money est…', opts: ['La valeur après la levée', 'La valeur avant la levée', "Le chiffre d'affaires"], ok: 0 },
  { q: 'Sur la BRVM, on passe un ordre via…', opts: ["N'importe quelle banque", 'Une SGI agréée', "Directement l'entreprise"], ok: 1 },
];
