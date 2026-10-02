/* Partage des certificats : ajout au profil LinkedIn (rubrique « Licences et certifications »). */

/** Lien « Ajouter au profil » de LinkedIn, prérempli avec le certificat et son adresse de vérification. */
export function linkedinCertUrl(o: { title: string; number: string; issuedAt: Date; verifyUrl: string }) {
  const p = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: o.title,
    organizationName: 'CEA FOR AFRICA',
    issueYear: String(o.issuedAt.getFullYear()),
    issueMonth: String(o.issuedAt.getMonth() + 1),
    certUrl: o.verifyUrl,
    certId: o.number,
  });
  return `https://www.linkedin.com/profile/add?${p}`;
}
