// src/lib/labExtract/scrub.ts
// Anonymisation du texte d'un bilan AVANT tout envoi à un tiers (API
// Anthropic, voir llm.ts). On supprime ce qui identifie le patient ou le
// prescripteur ; il ne doit rester que les marqueurs, valeurs, unités et
// bornes de référence. Ce n'est pas une garantie absolue (une mise en page
// inhabituelle peut laisser passer une donnée) — d'où l'opt-in explicite de
// l'utilisateur et la mention des limites dans l'interface et la doc.

export interface ScrubContext {
  name: string;
  email: string;
  birthDate?: Date | null;
}

function strip(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Lignes entières supprimées (libellés d'identité, de contact, d'adresse, de
// prescripteur). Testées sur le texte sans accents / en minuscules.
const IDENTITY_LINE =
  /(\bpatient(?:e)?\b|\bnom\b|\bprenom\b|\bne\(e\)|\bnee? le\b|date de naissance|\bnaissance\b|\badresse\b|\bcode postal\b|\brue\b|\bavenue\b|\bboulevard\b|\bchemin\b|\btel\b|\btelephone\b|\bmobile\b|\bmail\b|\bsecu\b|securite sociale|\bnir\b|\bdossier\b|\bidentifiant\b|\bipp\b|prescripteur|prescrit par|\bdocteur\b|\bdr\.?\s|\bmedecin\b|\b\d{5}\s+[a-z]{3,})/;

const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

function birthDatePatterns(date: Date): RegExp[] {
  const d = date.getUTCDate();
  const m = date.getUTCMonth() + 1;
  const y = date.getUTCFullYear();
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const yy = String(y).slice(-2);
  const alternatives = [
    `0?${d}[./-]0?${m}[./-](?:${y}|${yy})`,
    `${dd}${mm}${y}`,
    `${y}-${mm}-${dd}`,
    `0?${d}(?:er)?\\s+${MONTHS[m - 1]}\\s+${y}`,
  ];
  return alternatives.map((a) => new RegExp(`(?<!\\d)${a}(?!\\d)`, 'g'));
}

export function scrubText(text: string, ctx: ScrubContext): string {
  // 1. Lignes d'identité
  const kept = text.split(/\r?\n/).filter((line) => !IDENTITY_LINE.test(strip(line)));
  let out = kept.join('\n');

  // 2. Motifs identifiants restants (sur le texte original : les indices de
  // `strip` ne correspondent pas toujours à ceux de l'original).
  out = out.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[EMAIL]');
  out = out.replace(/(?<!\d)[12]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}(?:\s?\d{2})?(?!\d)/g, '[NIR]');
  out = out.replace(/(?<!\d)(?:\+33\s?|0033\s?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/g, '[TEL]');

  if (ctx.email) out = out.replace(new RegExp(escapeRegExp(ctx.email), 'gi'), '[EMAIL]');
  if (ctx.birthDate) {
    for (const pattern of birthDatePatterns(ctx.birthDate)) out = out.replace(pattern, '[DATE_NAISSANCE]');
  }

  // 3. Nom de l'utilisateur, jeton par jeton, sans tenir compte des accents
  // ni de la casse (« DUPONT », « Dupont », « Dupönt »).
  for (const token of ctx.name.split(/\s+/).filter((t) => strip(t).length >= 2)) {
    const accentInsensitive = escapeRegExp(strip(token)).replace(/[aeiouyc]/g, (c) =>
      c === 'c' ? '[cç]' : `[${c}${c.toUpperCase()}${accentVariants(c)}]`
    );
    out = out.replace(new RegExp(`(?<![\\p{L}])${accentInsensitive}(?![\\p{L}])`, 'giu'), '[NOM]');
  }
  return out;
}

function accentVariants(c: string): string {
  switch (c) {
    case 'a': return 'àâäÀÂÄ';
    case 'e': return 'éèêëÉÈÊË';
    case 'i': return 'îïÎÏ';
    case 'o': return 'ôöÔÖ';
    case 'u': return 'ùûüÙÛÜ';
    case 'y': return 'ÿŸ';
    default: return '';
  }
}
