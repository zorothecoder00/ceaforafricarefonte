/* Libellés des campagnes (CDC §12), partagés par les pages du back-office. */
export const CHANNEL_LABEL = { email: 'E-mail', sms: 'SMS', whatsapp: 'WhatsApp', push: 'Notification push' } as const;
export const STATUS_LABEL = { brouillon: 'Brouillon', programmee: 'Programmée', envoi: 'Envoi en cours', envoyee: 'Envoyée', annulee: 'Arrêtée' } as const;
export const STATUS_TONE = { brouillon: '', programmee: 'gold', envoi: 'info', envoyee: 'ok', annulee: 'bad' } as const;
