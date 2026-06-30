/**
 * Single source of truth for which surfaces render WITHOUT the personal app
 * shell (sidebar / top bar / footer). Add a section name here once and every
 * piece of chrome respects it — there is no per-page wiring to forget.
 *
 * Matching is on the FIRST path segment, not a substring. That distinction is
 * the whole point: "/team/123" (a team workspace, which supplies its own chrome)
 * is standalone, while the "/teams" index is an ordinary app page that keeps the
 * shell. A naive `startsWith("/team")` would wrongly strip the shell from
 * "/teams" — exactly the class of bug this prevents as routes multiply.
 *
 * Both the signed-in chrome (AppChrome) and the signed-out chrome (PublicChrome)
 * call this, and both decide client-side from usePathname, so the decision is
 * re-made on every client-side ("soft") navigation and can never go stale — the
 * failure mode where the shell stayed hidden after navigating out of /e/... into
 * the app.
 */
export const STANDALONE_SECTIONS: readonly string[] = ["e", "team", "tournament", "q"];

/** True when `pathname`'s first segment is a standalone surface. */
export function isStandalonePath(pathname: string): boolean {
  const firstSegment = pathname.split("/")[1] ?? ""; // "" for "/", "teams" for "/teams"
  return STANDALONE_SECTIONS.includes(firstSegment);
}
