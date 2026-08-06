import { Tablet, WifiOff, Wifi } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { getPrivilegedClient } from "@/lib/privileged";
import { labelDevice, retireDevice } from "./actions";

export const metadata = { title: "Devices · Admin" };

type Row = {
  install_id: string;
  label: string | null;
  venue_name: string | null;
  app_version: string | null;
  platform: string | null;
  network_state: string | null;
  battery_pct: number | null;
  first_seen_at: string;
  last_seen_at: string;
  retired_at: string | null;
  notes: string | null;
};

/** A device is "up" if it has beaten within 15 minutes — roughly three missed
 *  heartbeats at a 5-minute cadence, so a single flaky beat doesn't cry wolf. */
const UP_WINDOW_MS = 15 * 60_000;

// Module-level helper: the lint rule forbids calling impure functions during
// render, and this page legitimately needs wall-clock time to decide liveness.
const nowMs = () => Date.now();

export default async function AdminDevicesPage() {
  await requireAdmin("support");
  const admin = getPrivilegedClient({ reason: "admin:devices-console" });
  const [{ data }, { data: fleet }, { data: tiers }] = await Promise.all([
    admin
      .from("courtside_devices")
      .select("install_id, label, venue_name, app_version, platform, network_state, battery_pct, first_seen_at, last_seen_at, retired_at, notes")
      .order("last_seen_at", { ascending: false })
      .limit(200),
    admin.rpc("courtside_fleet_status"),
    admin.rpc("courtside_device_tiers"),
  ]);

  const rows = (data ?? []) as Row[];
  const f = fleet?.[0];
  const tierOf = new Map((tiers ?? []).map((t) => [t.install_id, t.tier]));
  const active = rows.filter((r) => !r.retired_at);
  const retired = rows.filter((r) => r.retired_at);
  const now = nowMs();
  const isUp = (r: Row) => now - Date.parse(r.last_seen_at) < UP_WINDOW_MS;
  const up = active.filter(isUp).length;

  // Stale-build detection: the newest version any device reports is treated as
  // current, so a venue on an older build is visible before it hits a fixed bug.
  const versions = active.map((r) => r.app_version).filter(Boolean) as string[];
  const newest = versions.sort().at(-1) ?? null;

  return (
    <div className="mx-auto w-full max-w-page px-4 py-8">
      <h1 className="font-athletic text-3xl uppercase tracking-wide text-ink">Courtside devices</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">
        Every courtside iPad heartbeats with its build, network state, and battery. A unit is
        counted <strong>up</strong> if it has reported in the last 15 minutes. Install ids identify a
        unit for operations only — they authorize nothing.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Registered" value={String(f?.registered ?? active.length)} hint="Non-retired units that have ever checked in." />
        <Stat label="App open" value={String(f?.app_open ?? up)} hint="Heartbeat in the last 15 minutes. The app is running — nothing more." />
        <Stat label="On a live session" value={String(f?.on_live_session ?? 0)} hint="Open AND pointed at a session that is live." />
        <Stat
          label="Running live play"
          value={String(f?.in_active_play ?? 0)}
          hint="On a live session that has a team waiting or a match in progress. This is the number that means a venue is actually working."
          tone={(f?.on_live_session ?? 0) > (f?.in_active_play ?? 0) ? "alert" : undefined}
        />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Stat label="Current build" value={newest ?? "—"} />
        <Stat label="Retired" value={String(retired.length)} />
      </div>
      <p className="mt-3 max-w-3xl text-xs text-mute">
        The gap between <strong>App open</strong> and <strong>Running live play</strong> is not
        necessarily a fault — a venue between sessions sits there legitimately. A unit that stays
        open for days with no live play is worth a call.
      </p>

      <section className="mt-8">
        <h2 className="font-athletic text-lg uppercase tracking-wide text-ink">Active fleet</h2>
        <div className="mt-3 space-y-3">
          {active.length === 0 ? (
            <p className="rounded-xl border border-rule bg-surface px-4 py-6 text-sm text-mute">
              No devices have reported yet. A unit appears here after its first heartbeat.
            </p>
          ) : (
            active.map((r) => <DeviceCard key={r.install_id} row={r} up={isUp(r)} newest={newest} tier={tierOf.get(r.install_id)} />)
          )}
        </div>
      </section>

      {retired.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-athletic text-lg uppercase tracking-wide text-mute">Retired</h2>
          <div className="mt-3 space-y-3">
            {retired.map((r) => <DeviceCard key={r.install_id} row={r} up={false} newest={newest} retired />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "alert"; hint?: string }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === "alert" ? "border-[#E4B8B8] bg-[#FBEAEA]" : "border-rule bg-surface"}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-mute">{hint}</p> : null}
    </div>
  );
}

function DeviceCard({ row, up, newest, retired, tier }: { row: Row; up: boolean; newest: string | null; retired?: boolean; tier?: string }) {
  const stale = !!newest && !!row.app_version && row.app_version !== newest;
  return (
    <div className={`rounded-xl border bg-surface p-4 ${retired ? "border-rule opacity-70" : up ? "border-rule" : "border-[#E4B8B8]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Tablet className="h-4 w-4 text-mute" aria-hidden />
            <span className="font-medium text-ink">{row.label || "Unnamed device"}</span>
            {retired ? null : up ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#EAF6EC] px-1.5 py-0.5 font-mono text-floor font-bold tracking-[0.1em] text-[#217A34]">
                <Wifi className="h-3 w-3" aria-hidden /> UP
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-[#FBEAEA] px-1.5 py-0.5 font-mono text-floor font-bold tracking-[0.1em] text-[#8A1B1B]">
                <WifiOff className="h-3 w-3" aria-hidden /> NOT SEEN
              </span>
            )}
            {!retired && tier === "in_play" ? (
              <span className="inline-flex rounded-md bg-[#EAF6EC] px-1.5 py-0.5 font-mono text-floor font-bold tracking-[0.1em] text-[#217A34]">
                RUNNING LIVE PLAY
              </span>
            ) : !retired && tier === "on_live_session" ? (
              <span className="inline-flex rounded-md bg-[#FFF6E5] px-1.5 py-0.5 font-mono text-floor font-bold tracking-[0.1em] text-[#8A5A1B]">
                LIVE SESSION · IDLE
              </span>
            ) : null}
            {stale ? (
              <span className="inline-flex rounded-md bg-bg px-1.5 py-0.5 font-mono text-floor font-bold tracking-[0.1em] text-mute">
                STALE BUILD
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-sm text-ink-soft">{row.venue_name || "No venue set"}</div>
          <div className="mt-1 font-mono text-[10px] text-mute">
            {row.install_id.slice(0, 8)} · v{row.app_version ?? "?"} · {row.platform ?? "?"} ·{" "}
            {row.network_state ?? "?"} · {row.battery_pct != null ? `${row.battery_pct}%` : "battery ?"}
          </div>
          <div className="mt-1 text-xs text-mute">
            Last seen {new Date(row.last_seen_at).toLocaleString("en-US")} · first seen{" "}
            {new Date(row.first_seen_at).toLocaleDateString("en-US")}
          </div>
          {row.notes ? <p className="mt-2 text-xs text-ink-soft">{row.notes}</p> : null}
        </div>

        <form action={retireDevice} className="shrink-0">
          <input type="hidden" name="installId" value={row.install_id} />
          {retired ? <input type="hidden" name="undo" value="1" /> : null}
          <button type="submit" className="rounded-lg border border-rule bg-surface px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-bg">
            {retired ? "Un-retire" : "Retire"}
          </button>
        </form>
      </div>

      <form action={labelDevice} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
        <input type="hidden" name="installId" value={row.install_id} />
        <input name="label" defaultValue={row.label ?? ""} placeholder="Device name" className="rounded-lg border border-rule bg-bg px-2.5 py-1.5 text-sm text-ink" />
        <input name="venueName" defaultValue={row.venue_name ?? ""} placeholder="Venue" className="rounded-lg border border-rule bg-bg px-2.5 py-1.5 text-sm text-ink" />
        <input name="notes" defaultValue={row.notes ?? ""} placeholder="Notes (mount location, contact, etc.)" className="rounded-lg border border-rule bg-bg px-2.5 py-1.5 text-sm text-ink" />
        <button type="submit" className="rounded-lg border border-rule bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-bg">Save</button>
      </form>
    </div>
  );
}
