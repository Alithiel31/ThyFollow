// src/lib/labExtract/rules.test.ts
// Textes SYNTHÉTIQUES (aucune donnée réelle) imitant plusieurs mises en page
// de comptes rendus de laboratoire.
import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { parseLabText } from './rules.js';
import { extractPdfText } from './pdfText.js';

const LAYOUT_TABLE = `
LABORATOIRE BIOGROUP
Prélevé le 12/03/2026
Prescripteur : Dr Martin
Thyréostimuline (TSH) ultrasensible   2,35   mUI/L   (0,35 - 4,94)
T4 libre   14,2   pmol/L   (12,0 - 22,0)
T3 libre   4,1   pmol/L   (3,1 - 6,8)
Anticorps anti-TPO   18   UI/mL   (< 34)
Ferritine   64   µg/L
`;

const LAYOUT_STACKED = `
Cerballiance
Date du prélèvement : 12 mars 2026
Médecin prescripteur : Dr Martin
TSH
2,35 mUI/L
T4 libre
14,2 pmol/L
T3 libre
4,1 pmol/L
Anti-TPO
18 UI/mL
Ferritine
64 µg/L
`;

const LAYOUT_COLON = `
Laboratoire Biogroup
Prélèvement du 2026-03-12
Prescrit par : Dr Martin
TSH : 2.35 µUI/mL
FT4 : 14.2 pmol/L
FT3 : 4.1 pmol/L
Anti-TPO : 18 IU/mL
Ferritine : 64 ng/mL
`;

const EXPECTED = { tsh: 2.35, ft4: 14.2, ft3: 4.1, antiTPO: 18, ferritin: 64 };

describe('labExtract/rules — mises en page', () => {
  it.each([
    ['tableau', LAYOUT_TABLE],
    ['libellé / valeur sur deux lignes', LAYOUT_STACKED],
    ['« libellé : valeur unité »', LAYOUT_COLON],
  ])('extrait le même résultat depuis la mise en page %s', (_name, text) => {
    const r = parseLabText(text);
    expect(r.values).toEqual(EXPECTED);
    expect(r.date).toBe('2026-03-12');
    expect(r.dateConfidence).toBe('high');
    expect(r.orderedBy).toBe('Dr Martin');
    expect(r.lab).toBe(text.includes('Cerballiance') ? 'Cerballiance' : 'Biogroup');
    expect(r.insufficient).toBe(false);
  });
});

describe('labExtract/rules — marqueurs', () => {
  const cases: Array<[string, string, number]> = [
    ['tsh', 'TSH ultrasensible 1,8 mUI/L', 1.8],
    ['ft4', 'Thyroxine libre (FT4) 15 pmol/L', 15],
    ['ft3', 'Triiodothyronine libre 4,5 pmol/L', 4.5],
    ['t4', 'T4 totale 95 nmol/L', 95],
    ['t3', 'T3 totale 1,9 nmol/L', 1.9],
    ['antiTPO', 'Anticorps anti-thyroperoxydase 12 UI/mL', 12],
    ['antiTG', 'Anticorps anti-thyroglobuline 30 UI/mL', 30],
    ['antiTSHR', 'Anticorps anti-récepteurs de la TSH 0,8 UI/L', 0.8],
    ['thyroglobulin', 'Thyroglobuline 8 µg/L', 8],
    ['ferritin', 'Ferritine 70 µg/L', 70],
    ['vitaminD', '25-OH Vitamine D 75 nmol/L', 75],
    ['vitaminB12', 'Vitamine B12 350 pmol/L', 350],
    ['magnesium', 'Magnésium 0,85 mmol/L', 0.85],
    ['selenium', 'Sélénium 95 µg/L', 95],
    ['cholesterol', 'Cholestérol total 5,1 mmol/L', 5.1],
    ['glucose', 'Glycémie à jeun 5,0 mmol/L', 5],
    ['hemoglobin', 'Hémoglobine 13,6 g/dL', 13.6],
  ];

  it.each(cases)('reconnaît %s', (marker, line, expected) => {
    const r = parseLabText(`Prélevé le 01/02/2026\n${line}`);
    expect(r.values[marker as keyof typeof r.values]).toBe(expected);
  });

  it('ne confond pas la thyroglobuline avec les anti-thyroglobuline', () => {
    const r = parseLabText('Prélevé le 01/02/2026\nAnticorps anti-thyroglobuline 30 UI/mL');
    expect(r.values.antiTG).toBe(30);
    expect(r.values.thyroglobulin).toBeUndefined();
  });

  it('ne prend pas « 25 » de « 25-OH vitamine D » ni « 3 » de « 3ème génération » pour une valeur', () => {
    const r = parseLabText('Prélevé le 01/02/2026\nTSH 3ème génération 2,1 mUI/L\n25-OH Vitamine D 41 nmol/L');
    expect(r.values.tsh).toBe(2.1);
    expect(r.values.vitaminD).toBe(41);
  });

  it('ignore les bornes de référence placées avant la valeur', () => {
    const r = parseLabText('Prélevé le 01/02/2026\nTSH (0,35 - 4,94) 2,35 mUI/L');
    expect(r.values.tsh).toBe(2.35);
  });
});

describe('labExtract/rules — unités et cas particuliers', () => {
  it('convertit FT4 1,10 ng/dL en pmol/L (≈ 14,2)', () => {
    const r = parseLabText('Prélevé le 01/02/2026\nFT4 1,10 ng/dL');
    expect(Math.abs((r.values.ft4 ?? 0) - 14.2)).toBeLessThan(0.1);
    expect(r.flags).toContainEqual({ marker: 'ft4', reason: 'converted' });
  });

  it('convertit vitamine D ng/mL, B12 pg/mL, cholestérol g/L et glycémie g/L', () => {
    const r = parseLabText(
      'Prélevé le 01/02/2026\nVitamine D 30 ng/mL\nVitamine B12 500 pg/mL\nCholestérol total 1,90 g/L\nGlycémie 0,90 g/L'
    );
    expect(r.values.vitaminD).toBeCloseTo(74.88, 1);
    expect(r.values.vitaminB12).toBeCloseTo(369, 0);
    expect(r.values.cholesterol).toBeCloseTo(4.91, 1);
    expect(r.values.glucose).toBeCloseTo(5.0, 1);
  });

  it('gère « TSH < 0,005 » : valeur nulle et signalée', () => {
    const r = parseLabText('Prélevé le 01/02/2026\nTSH < 0,005 mUI/L\nFerritine 50 µg/L');
    expect(r.values.tsh).toBeUndefined();
    expect(r.flags).toContainEqual({ marker: 'tsh', reason: 'comparator' });
    expect(r.values.ferritin).toBe(50);
  });

  it('refuse de deviner une unité inconnue', () => {
    const r = parseLabText('Prélevé le 01/02/2026\nTSH 2,3 furlongs');
    expect(r.values.tsh).toBeUndefined();
    expect(r.flags).toContainEqual({ marker: 'tsh', reason: 'unknown_unit' });
  });

  it('suppose l’unité cible quand elle est absente, et le signale', () => {
    const r = parseLabText('Prélevé le 01/02/2026\nTSH 2,3');
    expect(r.values.tsh).toBe(2.3);
    expect(r.flags).toContainEqual({ marker: 'tsh', reason: 'no_unit' });
  });

  it('ignore la date de naissance et préfère la date de prélèvement', () => {
    const r = parseLabText('Né(e) le 15/03/1985\nPrélevé le 12/03/2026\nTSH 2,3 mUI/L');
    expect(r.date).toBe('2026-03-12');
    expect(r.dateConfidence).toBe('high');
  });

  it('lit une date écrite avec le signe moins U+2212 (« 09−12−2025 »)', () => {
    const r = parseLabText('Prélevé le 09\u221212\u22122025 08:04\nTSH 2,3 mUI/L');
    expect(r.date).toBe('2025-12-09');
    expect(r.dateConfidence).toBe('high');
  });

  it('lit une date écrite avec un tiret demi-cadratin (U+2013)', () => {
    const r = parseLabText('Prélevé le 09\u201312\u20132025\nTSH 2,3 mUI/L');
    expect(r.date).toBe('2025-12-09');
    expect(r.dateConfidence).toBe('high');
  });

  it('la ligne « Prélevé le » l’emporte sur une date citée dans une note', () => {
    const r = parseLabText(
      [
        'Prélevé le 09\u221212\u22122025 08:04',
        'Edité le Mardi 09 Décembre 2025 à 12:43',
        'TSH 2,3 mUI/L',
        'Note : arrêté ministériel (JO du 30/4/2024), recommandations HAS 2023.',
        'Résultat antérieur du 03\u221211\u22122025',
      ].join('\n')
    );
    expect(r.date).toBe('2025-12-09');
    expect(r.dateConfidence).toBe('high');
  });

  it('une plage de référence écrite avec U+2212 n’est pas prise pour la valeur', () => {
    const r = parseLabText('Prélevé le 01/02/2026\nTSH (0,27 \u2212 4,20) 2,35 mUI/L');
    expect(r.values.tsh).toBe(2.35);
  });

  it('reconnaît un libellé abrégé avec des points (« T.S.H. ») et garde la précision lue', () => {
    const r = parseLabText('Prélevé le 21/07/26\nT.S.H.  1,776 mUI/L  0.35 à 4.94');
    expect(r.values.tsh).toBe(1.776);
  });

  it('ne prend pas la valeur d’une note de bas de page qui cite le marqueur', () => {
    const note =
      'Après 60 ans la valeur recommandée doit être inférieure à la décennie d’âge (exemple : TSH # 8 mUI/L pour une personne de 80 à 89 ans)';
    const withResult = parseLabText(`Prélevé le 21/07/26\nT.S.H.  1,776 mUI/L  0.35 à 4.94\n${note}`);
    expect(withResult.values.tsh).toBe(1.776);

    const noteBeforeResult = parseLabText(`Prélevé le 21/07/26\n${note}\nT.S.H.  1,776 mUI/L`);
    expect(noteBeforeResult.values.tsh).toBe(1.776);

    const noteOnly = parseLabText(`Prélevé le 21/07/26\n${note}`);
    expect(noteOnly.values.tsh).toBeUndefined();
    expect(noteOnly.insufficient).toBe(true);
  });

  it('reconnaît F.T.4, T.4 libre et F.T.3 écrits avec des points', () => {
    const r = parseLabText('Prélevé le 01/02/2026\nF.T.4  14,2 pmol/L\nF.T.3  4,1 pmol/L');
    expect(r.values.ft4).toBe(14.2);
    expect(r.values.ft3).toBe(4.1);
    expect(parseLabText('Prélevé le 01/02/2026\nT.4 libre  15 pmol/L').values.ft4).toBe(15);
  });

  it('arrondit une valeur convertie mais pas une valeur lue telle quelle', () => {
    const r = parseLabText('Prélevé le 01/02/2026\nFT4 1,10 ng/dL\nTSH 1,776 mUI/L');
    expect(r.values.ft4).toBe(14.16);
    expect(r.values.tsh).toBe(1.776);
  });

  it('utilise une date non étiquetée avec une confiance faible', () => {
    const r = parseLabText('Compte rendu du 12/03/2026\nTSH 2,3 mUI/L');
    expect(r.date).toBe('2026-03-12');
    expect(r.dateConfidence).toBe('low');
  });

  it('un texte sans marqueur est insuffisant', () => {
    const r = parseLabText('Prélevé le 12/03/2026\nBonjour, voici votre compte rendu.');
    expect(r.insufficient).toBe(true);
    expect(r.values).toEqual({});
  });

  it('un texte sans date est insuffisant', () => {
    const r = parseLabText('TSH 2,3 mUI/L');
    expect(r.insufficient).toBe(true);
    expect(r.date).toBeNull();
  });
});

describe('labExtract/pdfText — PDF réel', () => {
  it('relit la valeur de TSH d’un PDF fabriqué', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage();
    const lines = ['Biogroup', 'Prélevé le 12/03/2026', 'TSH ultrasensible', 'Ferritine'];
    lines.forEach((t, i) => page.drawText(t, { x: 50, y: 750 - i * 20, size: 11, font }));
    page.drawText('2,35 mUI/L', { x: 300, y: 750 - 2 * 20, size: 11, font });
    page.drawText('64 µg/L', { x: 300, y: 750 - 3 * 20, size: 11, font });

    const text = await extractPdfText(Buffer.from(await doc.save()));
    const r = parseLabText(text);
    expect(r.values.tsh).toBe(2.35);
    expect(r.values.ferritin).toBe(64);
    expect(r.date).toBe('2026-03-12');
    expect(r.insufficient).toBe(false);
  });
});
