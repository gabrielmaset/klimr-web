import type { Database } from "@/lib/database.types";

export type ClassRow = Database["public"]["Tables"]["classes"]["Row"];
export type ClassSessionRow = Database["public"]["Tables"]["class_sessions"]["Row"];
export type ClassEnrollmentRow = Database["public"]["Tables"]["class_enrollments"]["Row"];
export type ClassProviderRow = Database["public"]["Tables"]["class_providers"]["Row"];

export type Recurrence = "one_off" | "recurring";
export type PriceBasis = "per_session" | "per_series";

/** Price label for a class. `basis` distinguishes a per-session fee from a flat series fee. */
export function formatClassPrice(isPaid: boolean, priceCents: number, basis: string): string {
  if (!isPaid || !priceCents) return "Free";
  const dollars = (priceCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
  return `${dollars}${basis === "per_series" ? " / series" : " / session"}`;
}

/** Seats left in a session given its (or the class's) capacity and the active head-count. */
export function spotsLeft(capacity: number | null, classCapacity: number | null, takenCount: number): number | null {
  const cap = capacity ?? classCapacity;
  if (cap == null) return null; // uncapped
  return Math.max(0, cap - takenCount);
}

/** An enrollment counts toward capacity unless it's been cancelled. */
export function takesSeat(status: string): boolean {
  return status === "enrolled" || status === "attended" || status === "no_show";
}

export function enrollmentLabel(status: string): string {
  switch (status) {
    case "enrolled":
      return "Enrolled";
    case "waitlisted":
      return "Waitlisted";
    case "attended":
      return "Attended";
    case "no_show":
      return "No-show";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function paymentLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Payment due";
    case "paid":
      return "Paid";
    case "refunded":
      return "Refunded";
    default:
      return "";
  }
}

/**
 * Expand a recurring schedule into concrete session start times: the first
 * datetime, then weekly for `weeks` total occurrences. One-off returns just the
 * first. Pure + bounded (no open-ended generation) so it can't blow up at scale.
 */
export function expandWeekly(firstISO: string, weeks: number): string[] {
  const first = new Date(firstISO);
  if (Number.isNaN(first.getTime())) return [];
  const n = Math.max(1, Math.min(52, Math.floor(weeks)));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(first);
    d.setDate(d.getDate() + i * 7);
    out.push(d.toISOString());
  }
  return out;
}
