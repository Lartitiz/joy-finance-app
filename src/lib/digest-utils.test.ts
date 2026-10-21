import { describe, it, expect } from 'vitest';
import { buildDigest, type DigestData } from './digest-utils';
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
const TODAY = '2026-11-01';

const data = (p: Partial<DigestData>): DigestData => ({
  derniere_synchro: '2026-10-26T06:00:12+00:00', factures: [], relances: [], devis: [], ...p,
});

describe('buildDigest', () => {
  it('objet et sections : clients à relancer, devis à relancer, signés, expirés', () => {
    const d = buildDigest(data({
      factures: [
        inv({ client_name: 'Yvan Ensco', amount: 400, date_due: '2026-06-10' }),
        inv({ client_name: 'Bureau', amount: 150, date_due: '2026-11-15' }),
        inv({ client_name: 'Oasis', amount: -1334, date_due: '2026-10-07' }),
      ],
      devis: [
        quote({ client_name: 'Ancien prospect', title: 'Atelier', date_issued: '2026-10-01' }),
        quote({ client_name: 'Récent', date_issued: '2026-10-28' }),
        quote({ client_name: 'Signé', status: 'signed', amount: 1200 }),
        quote({ client_name: 'Expiré', date_issued: '2026-08-01', date_expires: '2026-08-31' }),
      ],
    }), TODAY);
    expect(d.subject).toBe('Nowadays : 1 client à relancer, 2 devis à trancher, 1 devis à facturer');
    expect(d.body).toContain('- Yvan Ensco : 400,00 €, 1 facture, 144 j de retard, jamais relancé');
    expect(d.body).toContain('- Bureau : 150,00 €, pas encore échue');
    expect(d.body).not.toContain('Oasis');
    expect(d.body).toContain('- Ancien prospect (Atelier) : 500,00 €, envoyé le 01/10');
    expect(d.body).toContain('- Signé : 1 200,00 €, signé');
    expect(d.body).toContain('- Expiré : 500,00 €, expiré le 31/08/2026');
    expect(d.body).toContain('à laisser venir : 1 devis (500,00 €)');
    expect(d.body).toContain('recopiés d\'Indy le 26/10/2026');
    expect(d.body).not.toContain('Attention');
  });

  it('client relancé il y a moins de 15 jours : plus en priorité, date affichée', () => {
    const d = buildDigest(data({
      factures: [inv({ client_name: 'Yvan Ensco', amount: 400, date_due: '2026-06-10' })],
      relances: [{ client_name: 'yvan ensco', reminded_at: '2026-10-25' }],
    }), TODAY);
    expect(d.subject).toBe('Nowadays : rien à relancer ce mois-ci');
    expect(d.body).toContain('Aucune facture à relancer en priorité.');
    expect(d.body).toContain('- Yvan Ensco : 400,00 €, 144 j de retard, relancé le 25/10');
    expect(d.body).toContain('Aucun devis en attente.');
  });

  it('recopie Indy de plus de 8 jours : avertissement', () => {
    const d = buildDigest(data({ derniere_synchro: '2026-10-19T06:00:00+00:00' }), TODAY);
    expect(d.body).toContain('Attention : la dernière recopie Indy date de plus de 8 jours');
  });

  it('beaucoup de devis expirés : les plus récents, puis un compte', () => {
    const devis = Array.from({ length: 10 }, (_, i) =>
      quote({ client_name: `P${i}`, date_issued: '2026-01-01', date_expires: `2026-0${(i % 9) + 1}-15` }));
    const d = buildDigest(data({ devis }), TODAY);
    expect(d.body).toContain('- et 2 devis plus anciens');
    expect(d.subject).toBe('Nowadays : 10 devis à trancher');
  });
});
