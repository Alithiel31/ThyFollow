// src/lib/labExtract/rules.ts
// Extraction par règles du texte d'un bilan sanguin : date du prélèvement,
// laboratoire, prescripteur et les 17 marqueurs du modèle LabResult. Fonction
// pure (aucune E/S) : `parseLabText(texte)`. Le résultat est TOUJOURS relu
// par l'utilisateur avant enregistrement ; en cas d'extraction insuffisante,
// l'appelant peut basculer sur le repli LLM (voir llm.ts).
import { MARKER_KEYS, convertToTarget, type MarkerKey } from './units.js';

export type FlagReason = 'comparator' | 'unknown_unit' | 'no_unit' | 'converted';

export interface ExtractionFlag {
  marker: MarkerKey;
  reason: FlagReason;
}

export interface ParsedLabResult {
  // YYYY-MM-DD
  date: string | null;
  // 'high' : date étiquetée comme date de prélèvement ; 'low' : date trouvée
  // sans étiquette (à vérifier particulièrement)
  dateConfidence: 'high' | 'low' | null;
  lab: string | null;
  orderedBy: string | null;
  values: Partial<Record<MarkerKey, number>>;
  flags: ExtractionFlag[];
  // Pas de date ou aucun marqueur : l'extraction par règles est insuffisante
  insufficient: boolean;
}

// Minuscules, sans accents, µ → u, espaces insécables → espaces.
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[µμ]/g, 'u')
    .replace(/[  ]/g, ' ');
}

// Les libellés abrégés s'écrivent parfois avec des points (« T.S.H. », « F.T.4 ») : `\.?`.
// Ordre = priorité : les motifs les plus spécifiques d'abord (« anti-thyroglobuline »
// avant « thyroglobuline », « t4 libre » avant « t4 totale »…). Une ligne n'est
// attribuée qu'au premier marqueur reconnu.
const MARKER_PATTERNS: Array<[MarkerKey, RegExp]> = [
  ['antiTSHR', /(anti[- ]?(?:r[- ]?tsh|tshr|recepteurs?\b.*?\btsh)|\btrak\b|anticorps anti[- ]?recepteurs?\b.*?\btsh)/],
  ['antiTPO', /(anti[- ]?tpo|anti[- ]?thyroperoxydase|\batpo\b|anti[- ]?peroxydase)/],
  ['antiTG', /(anti[- ]?tg\b|anti[- ]?thyroglobuline)/],
  ['thyroglobulin', /\bthyroglobuline\b/],
  ['ft4', /(\bf\.?t\.?4\b|\bt\.?4 libre\b|thyroxine libre|free t4|l[- ]?thyroxine libre)/],
  ['ft3', /(\bf\.?t\.?3\b|\bt\.?3 libre\b|triiodothyronine libre|free t3)/],
  ['t4', /(\bt\.?4 totale?\b|thyroxine totale?|total t4)/],
  ['t3', /(\bt\.?3 totale?\b|triiodothyronine totale?|total t3)/],
  ['tsh', /(\bt\.?s\.?h\b|thyreostimuline|thyrotropine)/],
  ['ferritin', /\bferritine\b/],
  ['vitaminD', /(25[- ]?\(?oh\)?[- ]?(?:vitamine )?d\b|vitamine d\b|25[- ]?hydroxy[- ]?vitamine d)/],
  ['vitaminB12', /(vitamine b ?12\b|\bb ?12\b|cobalamine)/],
  ['magnesium', /\bmagnesium\b|\bmagnesemie\b/],
  ['selenium', /\bselenium\b/],
  ['cholesterol', /cholesterol total|cholesterol\b/],
  ['glucose', /(\bglycemie\b|\bglucose\b)/],
  ['hemoglobin', /\bhemoglobine\b/],
];

// Une ligne de résultat compte quelques mots ; une phrase de commentaire (note de bas de
// page, « exemple : TSH # 8 mUI/L pour une personne de 80 à 89 ans ») en compte beaucoup
// plus. On ne cherche pas de marqueur dans les lignes de prose : mieux vaut un champ vide
// qu'une valeur tirée d'une note.
const MAX_RESULT_LINE_WORDS = 20;

// Pour qu'une ligne « TSH 3eme generation » ne prenne pas « 3 » pour la valeur.
const NOISE_AFTER_LABEL = /^\s*(?:ultra[- ]?sensible|us|3 ?(?:eme|e)\s*generation|iii|\(.*?\))*/;

const NUMBER_RE = /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})|([<>]=?|≤|≥)?\s*(\d+(?:[.,]\d+)?)(?:\s*([a-zµμ%][a-zµμ0-9]*(?:\s?\/\s?[a-zµμ0-9]+)?))?/g;

interface RawValue {
  value: number;
  comparator: boolean;
  unit: string | null;
}

// Cherche la première valeur plausible dans `text` (après l'étiquette) :
// ignore les dates, les bornes de référence « (0,4 - 4,0) » et les nombres
// entre parenthèses.
function findValue(text: string): RawValue | null {
  NUMBER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NUMBER_RE.exec(text)) !== null) {
    if (match[1]) continue; // une date
    const start = match.index + (match[0].length - match[0].trimStart().length);
    const before = text.slice(0, start);
    if (/\(\s*$/.test(before)) continue; // nombre entre parenthèses
    const after = text.slice(match.index + match[0].length);
    if (/^\s*[-–]\s*\d/.test(after) && !match[2]) continue; // début d'une plage « 0,4 - 4,0 »
    const value = parseFloat(match[3].replace(',', '.'));
    if (Number.isNaN(value)) continue;
    return { value, comparator: Boolean(match[2]), unit: match[4]?.trim() || null };
  }
  return null;
}

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(day: number, month: number, year: number): string | null {
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || year > 2100) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function findDateIn(line: string): string | null {
  let m = line.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (m) return toIso(+m[1], +m[2], +m[3]);
  m = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return toIso(+m[3], +m[2], +m[1]);
  m = line.match(/\b(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s+(\d{4})\b/);
  if (m) return toIso(+m[1], MONTHS[m[2]], +m[3]);
  return null;
}

const SAMPLING_LABEL = /(prelev|date de l'examen|date d'examen|collecte)/;
const NON_SAMPLING_DATE_LINE = /(naissance|\bne le\b|\bnee le\b|\bne\(e\)|edite|edition|imprime|valide|validation|saisi|reception|facture)/;

function findDate(lines: string[]): { date: string | null; confidence: 'high' | 'low' | null } {
  for (let i = 0; i < lines.length; i++) {
    if (!SAMPLING_LABEL.test(lines[i]) || NON_SAMPLING_DATE_LINE.test(lines[i])) continue;
    const date = findDateIn(lines[i]) ?? (i + 1 < lines.length ? findDateIn(lines[i + 1]) : null);
    if (date) return { date, confidence: 'high' };
  }
  for (const line of lines) {
    if (NON_SAMPLING_DATE_LINE.test(line)) continue;
    const date = findDateIn(line);
    if (date) return { date, confidence: 'low' };
  }
  return { date: null, confidence: null };
}

const LAB_BRANDS: Array<[RegExp, string]> = [
  [/cerballiance/, 'Cerballiance'],
  [/\bcerba\b/, 'Cerba'],
  [/biogroup/, 'Biogroup'],
  [/synlab/, 'Synlab'],
  [/unilabs/, 'Unilabs'],
  [/eurofins/, 'Eurofins'],
  [/biomnis/, 'Biomnis'],
  [/inovie/, 'Inovie'],
  [/bioesterel/, 'Bioesterel'],
  [/dianalyse/, 'Dianalyse'],
  [/\blabco\b/, 'Labco'],
];

const MAX_LAB_LINE_WORDS = 8;
const LAB_LINE_REJECT = /(accredit|cofrac|\bliste\b|portee|n°|\bwww\b|\d{3,})/;

function findLab(originalLines: string[], normalizedLines: string[]): string | null {
  for (const [pattern, name] of LAB_BRANDS) {
    if (normalizedLines.some((l) => pattern.test(l))) return name;
  }
  // Repli : une ligne « Laboratoire X ». On n'accepte qu'une ligne COURTE et sans mention
  // d'accréditation/numéro : « Laboratoire accrédité n°8-3165. Liste des sites… » (pied de
  // page) n'est pas un nom de laboratoire. À défaut, l'utilisateur le saisit à la relecture.
  const index = normalizedLines.findIndex(
    (l) =>
      /\blaboratoires?\b/.test(l) &&
      !/prescri/.test(l) &&
      !LAB_LINE_REJECT.test(l) &&
      l.trim().split(/\s+/).length <= MAX_LAB_LINE_WORDS
  );
  if (index === -1) return null;
  return originalLines[index].replace(/\s{2,}.*$/, '').trim().slice(0, 80) || null;
}

function findPrescriber(originalLines: string[], normalizedLines: string[]): string | null {
  for (let i = 0; i < normalizedLines.length; i++) {
    const m = normalizedLines[i].match(/(?:prescripteur|prescrit par|medecin prescripteur|demande par)\s*:?\s*(.+)$/);
    if (!m) continue;
    const start = normalizedLines[i].length - m[1].length;
    const value = originalLines[i].slice(start).replace(/\s{2,}.*$/, '').trim();
    if (value) return value.slice(0, 80);
  }
  return null;
}

export function parseLabText(text: string): ParsedLabResult {
  // Certains laboratoires écrivent leurs dates avec des tirets typographiques
  // (signe moins U+2212, demi-cadratin...) : « 09−12−2025 ». On les ramène au « - »
  // ASCII (1 caractère → 1 caractère, les index restent alignés) pour que dates
  // et plages de référence soient reconnues.
  const originalLines = text
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .split(/\r?\n/)
    .map((l) => l.replace(/[  ]/g, ' ').trimEnd());
  const lines = originalLines.map(normalize);

  const values: Partial<Record<MarkerKey, number>> = {};
  const flags: ExtractionFlag[] = [];
  const seen = new Set<MarkerKey>();

  const labelOf = (line: string): { marker: MarkerKey; end: number } | null => {
    for (const [marker, pattern] of MARKER_PATTERNS) {
      const m = pattern.exec(line);
      if (m) return { marker, end: m.index + m[0].length };
    }
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().split(/\s+/).length > MAX_RESULT_LINE_WORDS) continue;
    const label = labelOf(lines[i]);
    if (!label || seen.has(label.marker)) continue;

    let rest = lines[i].slice(label.end).replace(NOISE_AFTER_LABEL, '');
    let raw = findValue(rest);
    // Mise en page « libellé » puis « valeur unité » sur la ligne suivante.
    if (!raw && i + 1 < lines.length && !labelOf(lines[i + 1]) && /^\s*[<>]?\s*\d/.test(lines[i + 1])) {
      rest = lines[i + 1];
      raw = findValue(rest);
    }
    if (!raw) continue;
    seen.add(label.marker);

    if (raw.comparator) {
      flags.push({ marker: label.marker, reason: 'comparator' });
      continue;
    }
    const converted = convertToTarget(label.marker, raw.value, raw.unit);
    if (!converted.ok) {
      flags.push({ marker: label.marker, reason: converted.reason });
      continue;
    }
    if (!raw.unit) flags.push({ marker: label.marker, reason: 'no_unit' });
    else if (converted.converted) flags.push({ marker: label.marker, reason: 'converted' });
    // On n'arrondit qu'après une conversion d'unité : une valeur lue telle quelle
    // (ex. 1,776) garde la précision donnée par le laboratoire.
    values[label.marker] = converted.converted ? Math.round(converted.value * 100) / 100 : converted.value;
  }

  const { date, confidence } = findDate(lines);
  const hasMarker = MARKER_KEYS.some((k) => values[k] !== undefined);

  return {
    date,
    dateConfidence: confidence,
    lab: findLab(originalLines, lines),
    orderedBy: findPrescriber(originalLines, lines),
    values,
    flags,
    insufficient: !date || !hasMarker,
  };
}
