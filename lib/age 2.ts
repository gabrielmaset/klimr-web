/** Age in whole years from a YYYY-MM-DD date string, or null if invalid. */
export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Approximate age from a birth year (fallback when no full DOB is stored). */
export function ageFromYear(year: number | null | undefined): number | null {
  if (!year) return null;
  const age = new Date().getFullYear() - year;
  return age >= 0 && age < 130 ? age : null;
}

/** Prefer a full DOB; fall back to birth year. */
export function displayAge(dob: string | null | undefined, year: number | null | undefined): number | null {
  return ageFromDob(dob) ?? ageFromYear(year);
}
