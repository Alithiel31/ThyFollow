// src/lib/labExtract/scrub.test.ts
import { describe, it, expect } from 'vitest';
import { scrubText } from './scrub.js';

const CTX = {
  name: 'Élodie Dupont-Martin',
  email: 'elodie.dupont@example.com',
  birthDate: new Date(Date.UTC(1985, 2, 15)),
};

const REPORT = `Laboratoire Biogroup
Patient : DUPONT-MARTIN Élodie
Née le 15/03/1985
Adresse : 12 rue des Lilas, 31000 TOULOUSE
Tél : 06 12 34 56 78
Email : elodie.dupont@example.com
N° sécurité sociale : 2 85 03 31 555 123 45
Prescripteur : Dr Durand
Prélevé le 12/03/2026
Bonjour Élodie, voici vos résultats. Contact : 05 61 00 00 00, e.dupont@autre.fr
Dossier du 15031985 pour Mme Dupont
TSH ultrasensible   2,35   mUI/L   (0,35 - 4,94)
T4 libre   14,2   pmol/L   (12,0 - 22,0)`;

describe('labExtract/scrub', () => {
  const out = scrubText(REPORT, CTX);

  it('supprime le nom de l’utilisateur sous toutes ses formes', () => {
    expect(out.toLowerCase()).not.toContain('dupont');
    expect(out.toLowerCase()).not.toContain('martin');
    expect(out.toLowerCase()).not.toContain('elodie');
    expect(out).not.toContain('Élodie');
  });

  it('supprime la date de naissance (y compris hors ligne dédiée)', () => {
    expect(out).not.toContain('15/03/1985');
    expect(out).not.toContain('15031985');
  });

  it('supprime emails, téléphones, n° de sécurité sociale et adresse', () => {
    expect(out).not.toContain('example.com');
    expect(out).not.toContain('autre.fr');
    expect(out).not.toContain('06 12 34 56 78');
    expect(out).not.toContain('05 61 00 00 00');
    expect(out).not.toContain('555 123');
    expect(out).not.toContain('Lilas');
    expect(out).not.toContain('TOULOUSE');
  });

  it('supprime le prescripteur', () => {
    expect(out).not.toContain('Durand');
  });

  it('conserve date de prélèvement, laboratoire, marqueurs, valeurs, unités et bornes', () => {
    expect(out).toContain('Biogroup');
    expect(out).toContain('Prélevé le 12/03/2026');
    expect(out).toContain('TSH ultrasensible   2,35   mUI/L   (0,35 - 4,94)');
    expect(out).toContain('T4 libre   14,2   pmol/L   (12,0 - 22,0)');
  });
});
