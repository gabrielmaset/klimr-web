import { requireAdmin } from "@/lib/admin";
import { fetchFleetMetrics } from "./actions";
import { FleetConsole } from "./fleet-console";

export const metadata = { title: "Live fleet · Admin" };
export const dynamic = "force-dynamic";

/** Live-queue fleet console (Aug 2026, founder spec).
 *
 *  Replaces the per-device roster, which was fine for two iPads and useless at
 *  a thousand — an operator wants counts they can trust and a way to act on a
 *  stuck one, not a list of hardware. Every number is computed live and the
 *  client re-polls every 15 seconds against a 45-second presence window, so the
 *  console stays inside the 30-second freshness target. */
export default async function AdminFleetPage() {
  await requireAdmin("support");
  const metrics = await fetchFleetMetrics();

  return (
    <div className="mx-auto w-full max-w-page px-4 py-8">
      <h1 className="font-athletic text-3xl uppercase tracking-wide text-ink">Live fleet</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">
        What is running right now across every venue. <strong>Running live play</strong> is the number
        that means a venue is actually working — a team waiting or a match in progress, not merely an
        app left open. Open any number to see the sessions behind it and force-end one that is stuck.
      </p>
      <div className="mt-6">
        <FleetConsole initial={metrics} />
      </div>
    </div>
  );
}
