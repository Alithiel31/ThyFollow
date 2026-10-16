// src/lib/labExtract/pdfText.ts
// Extrait le texte d'un PDF (déjà déchiffré, voir lib/pdfDecrypt.ts) en
// reconstituant les lignes à partir des coordonnées : pdfjs renvoie des
// fragments de texte positionnés, pas des lignes.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

interface TextFragment {
  str: string;
  x: number;
  y: number;
  width: number;
}

const LINE_TOLERANCE = 2.5; // tolérance verticale (points PDF) pour regrouper deux fragments sur une même ligne
const COLUMN_GAP = 12; // écart horizontal à partir duquel on sépare deux colonnes par un double espace

export async function extractPdfText(data: Buffer): Promise<string> {
  const loadingTask = getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const fragments: TextFragment[] = [];
      for (const item of content.items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        fragments.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width });
      }
      pages.push(fragmentsToLines(fragments));
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages.join('\n');
}

function fragmentsToLines(fragments: TextFragment[]): string {
  // De haut en bas (y décroissant en PDF), puis de gauche à droite.
  const sorted = [...fragments].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextFragment[][] = [];
  for (const fragment of sorted) {
    const current = lines[lines.length - 1];
    if (current && Math.abs(current[0].y - fragment.y) <= LINE_TOLERANCE) current.push(fragment);
    else lines.push([fragment]);
  }
  return lines
    .map((line) => {
      line.sort((a, b) => a.x - b.x);
      let text = '';
      let previousEnd = 0;
      for (const fragment of line) {
        if (text) text += fragment.x - previousEnd > COLUMN_GAP ? '  ' : ' ';
        text += fragment.str;
        previousEnd = fragment.x + fragment.width;
      }
      return text;
    })
    .join('\n');
}
