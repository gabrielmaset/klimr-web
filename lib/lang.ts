// lib/lang.ts — a cheap, conservative "is this probably not English?" check.
// Drives the discreet Translate-to-English button on event descriptions: false
// negatives just hide the button, so thresholds err toward NOT showing it.
// No dependencies, no network — stopword ratio + accented-letter density.

const EN_STOPWORDS = new Set([
  "the","and","to","of","a","in","is","for","with","on","at","by","from","that",
  "this","it","are","as","be","or","we","you","your","our","all","will","can",
  "have","has","not","but","if","so","an","when","who","what","how","more",
]);

export function looksNonEnglish(input: string | null | undefined): boolean {
  if (!input) return false;
  const plain = input
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/&[a-z]+;/gi, " ");
  const words = plain.toLowerCase().match(/[a-zà-öø-ÿ'’]{1,}/gi) ?? [];
  if (words.length < 12) return false;
  let stop = 0;
  for (const w of words) if (EN_STOPWORDS.has(w)) stop++;
  const stopRatio = stop / words.length;
  const letters = plain.match(/[a-zà-öø-ÿ]/gi) ?? [];
  const accented = plain.match(/[à-öø-ÿ]/gi) ?? [];
  const accentRatio = letters.length ? accented.length / letters.length : 0;
  return stopRatio < 0.05 || (stopRatio < 0.1 && accentRatio > 0.015);
}
