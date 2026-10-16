// src/lib/labExtract/units.ts
// Définition des 17 marqueurs du modèle LabResult : unité cible (celle de
// schema.prisma / LAB_RANGES côté frontend), unités alternatives courantes
// chez les laboratoires et facteur de conversion vers l'unité cible.

export const MARKER_KEYS = [
  'tsh', 'ft4', 'ft3', 't4', 't3',
  'antiTPO', 'antiTG', 'antiTSHR', 'thyroglobulin',
  'ferritin', 'vitaminD', 'vitaminB12', 'magnesium', 'selenium',
  'cholesterol', 'glucose', 'hemoglobin',
] as const;

export type MarkerKey = (typeof MARKER_KEYS)[number];

export interface MarkerUnits {
  target: string;
  // Clé d'unité normalisée (voir normalizeUnit) → facteur vers l'unité cible
  factors: Record<string, number>;
}

export const MARKER_UNITS: Record<MarkerKey, MarkerUnits> = {
  tsh: { target: 'mUI/L', factors: { 'miu/l': 1, 'uiu/ml': 1 } },
  ft4: { target: 'pmol/L', factors: { 'pmol/l': 1, 'ng/dl': 12.87, 'ng/l': 1.287, 'pg/ml': 1.287 } },
  ft3: { target: 'pmol/L', factors: { 'pmol/l': 1, 'pg/ml': 1.536, 'ng/l': 1.536, 'ng/dl': 15.36 } },
  t4: { target: 'nmol/L', factors: { 'nmol/l': 1, 'ug/dl': 12.87, 'ng/ml': 1.287, 'ug/l': 1.287 } },
  t3: { target: 'nmol/L', factors: { 'nmol/l': 1, 'ng/dl': 0.01536, 'ng/ml': 1.536, 'ug/l': 1.536 } },
  antiTPO: { target: 'UI/mL', factors: { 'iu/ml': 1, 'kiu/l': 1 } },
  antiTG: { target: 'UI/mL', factors: { 'iu/ml': 1, 'kiu/l': 1 } },
  antiTSHR: { target: 'UI/L', factors: { 'iu/l': 1, 'miu/l': 1, 'iu/ml': 1000 } },
  thyroglobulin: { target: 'µg/L', factors: { 'ug/l': 1, 'ng/ml': 1 } },
  ferritin: { target: 'µg/L', factors: { 'ug/l': 1, 'ng/ml': 1, 'pmol/l': 0.445 } },
  vitaminD: { target: 'nmol/L', factors: { 'nmol/l': 1, 'ng/ml': 2.496, 'ug/l': 2.496 } },
  vitaminB12: { target: 'pmol/L', factors: { 'pmol/l': 1, 'pg/ml': 0.738, 'ng/l': 0.738 } },
  magnesium: { target: 'mmol/L', factors: { 'mmol/l': 1, 'mg/l': 0.04114, 'mg/dl': 0.4114, 'meq/l': 0.5 } },
  selenium: { target: 'µg/L', factors: { 'ug/l': 1, 'ng/ml': 1, 'umol/l': 78.96, 'nmol/l': 0.07896 } },
  cholesterol: { target: 'mmol/L', factors: { 'mmol/l': 1, 'g/l': 2.586, 'mg/dl': 0.02586 } },
  glucose: { target: 'mmol/L', factors: { 'mmol/l': 1, 'g/l': 5.551, 'mg/dl': 0.05551 } },
  hemoglobin: { target: 'g/dL', factors: { 'g/dl': 1, 'g/l': 0.1 } },
};

// « µUI/mL », « uUI/ml », « mUI / L »… → « uiu/ml », « miu/l » (clé de MARKER_UNITS).
// On normalise UI (français) en IU (anglais) pour n'avoir qu'une notation.
export function normalizeUnit(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[µμ]/g, 'u')
    .replace(/\s+/g, '')
    .replace(/ui/g, 'iu');
}

export type ConversionResult =
  | { ok: true; value: number; converted: boolean }
  | { ok: false; reason: 'unknown_unit' };

// `unit` absent : on suppose l'unité cible (le plus courant sur un bilan
// français) ; l'appelant le signale via `converted:false` + drapeau no_unit.
export function convertToTarget(marker: MarkerKey, value: number, unit: string | null): ConversionResult {
  if (!unit) return { ok: true, value, converted: false };
  const key = normalizeUnit(unit);
  const factor = MARKER_UNITS[marker].factors[key];
  if (factor === undefined) return { ok: false, reason: 'unknown_unit' };
  return { ok: true, value: factor === 1 ? value : value * factor, converted: factor !== 1 };
}
