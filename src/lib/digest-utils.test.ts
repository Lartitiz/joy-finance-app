import { describe, it, expect } from 'vitest';
import { buildWeekly, shortName, todoAndPosition, type DigestData, type WeekChanges } from './digest-utils';
import type { Invoice } from './invoice-utils';
import type { Quote } from './quote-utils';

const inv = (p: Partial<Invoice>): Invoice => ({
  id: Math.random().toString(36), number: null, client_name: 'Cliente', amount: 1000,
  date_issued: '2026-08-01', date_due: '2026-08-31', status: 'sent', paid_date: null, ...p,
});
const quote = (p: Partial<Quote>): Quote => ({
  id: Math.random().toString(36), number: 'D1', client_name: 'Prospect', title: null, amount: 500,
  date_issued: '2026-10-20', date_expires: '2026-11-19', status: 'pending', ...p,
});
const TODAY = '2026-11-02';

const data = (p: Partial<DigestData>): DigestData => ({
  derniere_synchro: '2026-11-02T07:00:12+00:00', factures: [], relances: [], devis: [], ...p,
});
const changes = (p: Partial<WeekChanges>): WeekChanges => ({
  since: '2026-10-26', paid: [], invoiced: [], creditNotes: [], cancelledInvoices: [],
  newQuotes: [], signedQuotes: [], refusedQuotes: [], gaps: [], ...p,
});
const VILLE = 'Bureau du Design, de la Mode et des Métiers d’Art Direction de l’Attractivité et de l’Emploi de la Ville de Paris';

describe('buildWeekly', () => {
  it('à faire en tête : clients à relancer, devis signés, devis sans réponse, expirés', () => {
    const d = buildWeekly(data({
      factures: [
        inv({ client_name: 'Yvan Ensco', amount: 400, date_due: '2026-06-10' }),
        inv({ client_name: 'Ines', amount: 180, date_due: '2026-08-01' }),
        inv({ client_name: 'Ines', amount: 180, date_due: '2026-08-05' }),
        inv({ client_name: 'Bureau', amount: 150, date_due: '2026-11-15' }),
        inv({ client_name: 'Oasis', amount: -150, date_due: '2026-10-07' }),
      ],
      devis: [
        quote({ client_name: 'Ancien prospect', title: 'Atelier', date_issued: '2026-10-01' }),
        quote({ client_name: 'Récent', date_issued: '2026-10-28' }),
        quote({ client_name: 'Signé', status: 'signed', amount: 1200, date_issued: '2026-10-15' }),
        quote({ client_name: 'Expiré', date_issued: '2026-08-01', date_expires: '2026-08-31' }),
      ],
    }), TODAY, { changes: null, syncLine: null });
    expect(d.subject).toBe('Nowadays · 2 clients à relancer · 1 devis à facturer · 2 devis à trancher · 760,00 € à encaisser');
    const lines = d.body.split('\n');
    expect(lines[0]).toBe('À FAIRE CETTE SEMAINE');
    expect(lines[1]).toBe('- Relancer Yvan Ensco : 400,00 €, 145 j de retard, jamais relancé');
    expect(lines[2]).toBe('- Relancer Ines : 360,00 € (2 factures), 93 j de retard, jamais relancé');
    expect(d.body).toContain('- Facturer le devis signé Signé 1 200,00 € (devis du 15/10)');
    expect(d.body).toContain('- Relancer le devis Ancien prospect « Atelier » 500,00 € : envoyé le 01/10, sans réponse depuis 32 j');
    expect(d.body).toContain('- Devis Expiré 500,00 € expiré le 31/08 : relancer ou annuler dans Indy');
    expect(d.body).not.toContain('DEPUIS LA DERNIÈRE SYNCHRO');
    expect(d.body).toContain('OÙ TU EN ES\n760,00 € à encaisser sur 5 factures, dont 610,00 € en retard.');
    expect(d.body).toContain('- Bureau : 150,00 €, pas encore échue');
    expect(d.body).not.toContain('Oasis');
    expect(d.body).toContain('Devis envoyés récemment, à laisser venir : 1 devis (500,00 €).');
    expect(d.body).toContain("Rien n'a été envoyé à tes clients");
  });

  it('changements de la semaine : payées en premier, avec client et montant', () => {
    const d = buildWeekly(data({}), TODAY, {
      changes: changes({
        paid: [{ number: 'F202610-34', client_name: 'Oasis', amount: 900 }, { number: 'F202610-32', client_name: 'IMCI INSTITUT DES MEDIAS', amount: 1950 }],
        invoiced: [{ number: 'F202610-44', client_name: VILLE, amount: 1300 }, { number: 'F202610-37', client_name: VILLE, amount: 1300, note: 'déjà payée' }],
        creditNotes: [{ number: 'F202610-43', client_name: VILLE, amount: -1300 }],
        newQuotes: [{ number: 'D202610-31', client_name: 'Mairie de Village', amount: 2850, title: 'Atelier' }],
        signedQuotes: [{ number: 'D202610-28', client_name: 'Client', amount: 4867.5, note: 'déjà facturé' }],
        refusedQuotes: [{ number: 'D202608-24', client_name: 'Prospect', amount: 80 }],
        gaps: ['facture F1 : payée dans l\'app, pas dans Indy'],
      }),
      syncLine: 'Synchro Indy OK, lundi 02/11 à 08:01.',
    });
    expect(d.subject).toBe('Nowadays · rien à relancer · 2 factures payées · 0,00 € à encaisser');
    expect(d.body).toContain([
      'DEPUIS LA DERNIÈRE SYNCHRO (26/10)',
      '- Factures payées (2) :',
      '    F202610-34 · Oasis · 900,00 €',
      '    F202610-32 · IMCI · 1 950,00 €',
      '- Nouvelles factures (2) :',
      '    F202610-44 · Ville de Paris (Bureau du Design) · 1 300,00 €',
      '    F202610-37 · Ville de Paris (Bureau du Design) · 1 300,00 € (déjà payée)',
      '- Avoirs (1) :',
      '    F202610-43 · Ville de Paris (Bureau du Design) · -1 300,00 €',
      '- Nouveaux devis (1) :',
      '    D202610-31 · Mairie de Village « Atelier » · 2 850,00 €',
      '- Devis signés (1) :',
      '    D202610-28 · Client · 4 867,50 € (déjà facturé)',
      '- Devis refusés ou annulés (1) :',
      '    D202608-24 · Prospect · 80,00 €',
      '- À vérifier : facture F1 : payée dans l\'app, pas dans Indy',
    ].join('\n'));
    expect(d.body).toContain('Rien à relancer ni à facturer cette semaine.');
    expect(d.body).toContain('Synchro Indy OK, lundi 02/11 à 08:01.');
  });

  it('semaine calme : « Rien de nouveau dans Indy »', () => {
    const d = buildWeekly(data({}), TODAY, { changes: changes({}), syncLine: null });
    expect(d.body).toContain('DEPUIS LA DERNIÈRE SYNCHRO (26/10)\nRien de nouveau dans Indy.');
  });

  it('client relancé il y a moins de 15 jours : plus à relancer, date affichée plus bas', () => {
    const d = buildWeekly(data({
      factures: [inv({ client_name: 'Yvan Ensco', amount: 400, date_due: '2026-06-10' })],
      relances: [{ client_name: 'yvan ensco', reminded_at: '2026-10-25' }],
    }), TODAY, { changes: null, syncLine: null });
    expect(d.subject).toBe('Nowadays · rien à relancer · 400,00 € à encaisser');
    expect(d.body).toContain('- Yvan Ensco : 400,00 €, 145 j de retard, relancé le 25/10');
  });

  it('échéances des 7 prochains jours', () => {
    const d = buildWeekly(data({
      factures: [
        inv({ client_name: 'Oasis', amount: 726, date_due: '2026-11-05' }),
        inv({ client_name: 'Plus tard', amount: 100, date_due: '2026-11-20' }),
      ],
    }), TODAY, { changes: null, syncLine: null });
    expect(d.body).toContain('Arrivent à échéance d\'ici lundi prochain : Oasis 726,00 € le 05/11.');
  });

  it('beaucoup de devis expirés : les plus récents, puis un compte', () => {
    const devis = Array.from({ length: 10 }, (_, i) =>
      quote({ client_name: `P${i}`, date_issued: '2026-01-01', date_expires: `2026-0${(i % 9) + 1}-15` }));
    const d = buildWeekly(data({ devis }), TODAY, { changes: null, syncLine: null });
    expect(d.body).toContain('- et 2 devis expirés plus anciens');
    expect(d.subject).toBe('Nowadays · 10 devis à trancher · 0,00 € à encaisser');
  });
});

describe('shortName et todoAndPosition', () => {
  it('raccourcit les noms officiels trop longs', () => {
    expect(shortName(VILLE)).toBe('Ville de Paris (Bureau du Design)');
    expect(shortName('IMCI INSTITUT DES MEDIAS ET DE LA COMMUNICATION SUR INTERNET')).toBe('IMCI');
    expect(shortName('Saint Aubin Sur Yonne La Prochaine Aire')).toBe('Saint Aubin Sur Yonne La Prochaine Aire');
    expect(shortName('Association pour la promotion des arts et métiers du livre')).toBe('Association pour la promotion des arts…');
  });

  it('sections réutilisées par l\'e-mail d\'arrêt', () => {
    const { todo, position } = todoAndPosition(data({}), TODAY);
    expect(todo).toEqual(['Rien à relancer ni à facturer cette semaine.']);
    expect(position[0]).toBe('0,00 € à encaisser sur 0 facture, dont 0,00 € en retard.');
  });
});
