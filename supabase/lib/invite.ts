// Single source of truth for the current invite / access-code format.
//
// Codes are XXXX-XXXX-XXXX — three 4-char blocks from a no-lookalike alphabet
// (ABCDEFGHJKMNPQRSTUVWXYZ23456789: no I, L, O, 0 or 1), ~59 bits of randomness,
// no prefix. This mirrors the database: migration 0003 (invite codes) and 0023
// (investor codes). If the DB format ever changes, update it HERE too — everything
// in the app validates through this module so it can't drift back to old shapes.

export const INVITE_CODE_REGEX = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;

/** Uppercase, strip junk, and re-insert dashes so a pasted "x7qmk2nfb9g3" becomes
 *  "X7QM-K2NF-B9G3". Anything that isn't a clean 12 chars is returned trimmed +
 *  uppercased as a best effort (the database lookup stays authoritative). */
export function normalizeInviteCode(raw: string): string {
  const cleaned = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length === 12) return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}`;
  return String(raw ?? "").trim().toUpperCase();
}

export function isValidInviteCode(code: string): boolean {
  return INVITE_CODE_REGEX.test(code);
}
