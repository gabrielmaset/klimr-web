// Recovery window shared by events, tournaments, and teams. A cancelled/deleted row keeps
// all its data and can be recovered for this many days, after which it's archived read-only.
export const RECOVER_WINDOW_DAYS = 90;

export function withinRecoverWindow(cancelledAtISO: string | null): boolean {
  if (!cancelledAtISO) return true;
  return Date.now() - new Date(cancelledAtISO).getTime() < RECOVER_WINDOW_DAYS * 86400000;
}

export function recoverDaysLeft(cancelledAtISO: string | null): number {
  if (!cancelledAtISO) return RECOVER_WINDOW_DAYS;
  const elapsed = Date.now() - new Date(cancelledAtISO).getTime();
  return Math.max(0, Math.ceil((RECOVER_WINDOW_DAYS * 86400000 - elapsed) / 86400000));
}
