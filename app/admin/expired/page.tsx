import Link from "next/link";
import { sportMeta } from "@/lib/sports";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { Clock } from "lucide-react";

export const dynamic = "force-dynamic";

/** Expired-content explorer (Gabriel's spec): search anything date-bearing
 *  that has passed — matches, events, tournaments, class sessions — by type,
 *  date range, and organizer. Retention policy (0156): everything is kept
 *  indefinitely — a member's history is a permanent product feature; only
 *  account deletion removes data. */

type Row = { kind: string; id: string; title: string; when: string | null; organizer: string; status: string; href: string };
const TYPES = [
  { key: "match", label: "Matches" },
  { key: "event", label: "Events" },
  { key: "tournament", label: "Tournaments" },
  { key: "class_session", label: "Class sessions" },
] as const;

export default async function ExpiredContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const admin = createAdminClient();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;

  const type = TYPES.some((t) => t.key === one("type")) ? (one("type") as string) : "match";
  const nowIso = new Date().toISOString();
  const from = one("from") ? `${one("from")}T00:00:00Z` : undefined;
  const to = one("to") ? `${one("to")}T23:59:59Z` : nowIso;
  const q = (one("q") ?? "").trim();

  // Organizer text → matching profile ids (name search via admin, this is an
  // internal moderation surface).
  let organizerIds: string[] | null = null;
  if (q) {
    const { data: profs } = await admin.from("profiles").select("id").ilike("display_name", `%${q.replace(/[%_\\]/g, "")}%`).limit(50);
    organizerIds = (profs ?? []).map((p) => p.id);
  }

  const rows: Row[] = [];
  const nameOf = new Map<string, string>();
  const collectNames = async (ids: (string | null)[]) => {
    const need = [...new Set(ids.filter((x): x is string => !!x && !nameOf.has(x)))];
    if (!need.length) return;
    const { data } = await admin.from("profiles").select("id, display_name").in("id", need);
    for (const p of data ?? []) nameOf.set(p.id, p.display_name || "—");
  };

  if (type === "match") {
    let qb = admin
      .from("matches")
      .select("id, sport_key, format, scheduled_at, status, organizer_id")
      .not("scheduled_at", "is", null)
      .lt("scheduled_at", to)
      .order("scheduled_at", { ascending: false })
      .limit(100);
    if (from) qb = qb.gte("scheduled_at", from);
    if (organizerIds) qb = qb.in("organizer_id", organizerIds.length ? organizerIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data } = await qb;
    await collectNames((data ?? []).map((m) => m.organizer_id));
    for (const m of data ?? [])
      rows.push({ kind: "Match", id: m.id, title: `${sportMeta(m.sport_key).name} · ${m.format}`, when: m.scheduled_at, organizer: nameOf.get(m.organizer_id ?? "") ?? "—", status: m.status, href: `/play/${m.id}` });
  } else if (type === "event") {
    let qb = admin
      .from("events")
      .select("id, title, sport_key, starts_at, status, created_by")
      .lt("starts_at", to)
      .order("starts_at", { ascending: false })
      .limit(100);
    if (from) qb = qb.gte("starts_at", from);
    if (organizerIds) qb = qb.in("created_by", organizerIds.length ? organizerIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data } = await qb;
    await collectNames((data ?? []).map((e) => e.created_by));
    for (const e of data ?? [])
      rows.push({ kind: "Event", id: e.id, title: e.title, when: e.starts_at, organizer: nameOf.get(e.created_by ?? "") ?? "—", status: e.status, href: `/events/${e.id}` });
  } else if (type === "tournament") {
    let qb = admin
      .from("tournaments")
      .select("id, code, title, sport_key, starts_at, status, owner_id")
      .lt("starts_at", to)
      .order("starts_at", { ascending: false })
      .limit(100);
    if (from) qb = qb.gte("starts_at", from);
    if (organizerIds) qb = qb.in("owner_id", organizerIds.length ? organizerIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data } = await qb;
    await collectNames((data ?? []).map((t) => t.owner_id));
    for (const t of data ?? [])
      rows.push({ kind: "Tournament", id: t.id, title: t.title, when: t.starts_at, organizer: nameOf.get(t.owner_id ?? "") ?? "—", status: t.status, href: `/e/${t.code}` });
  } else {
    let qb = admin
      .from("class_sessions")
      .select("id, class_id, starts_at, status")
      .lt("starts_at", to)
      .order("starts_at", { ascending: false })
      .limit(100);
    if (from) qb = qb.gte("starts_at", from);
    const { data } = await qb;
    const classIds = [...new Set((data ?? []).map((s) => s.class_id))];
    const titles = new Map<string, string>();
    if (classIds.length) {
      const { data: cls } = await admin.from("classes").select("id, title").in("id", classIds);
      for (const c of cls ?? []) titles.set(c.id, c.title);
    }
    for (const s of data ?? [])
      rows.push({ kind: "Class session", id: s.id, title: titles.get(s.class_id) ?? "Class", when: s.starts_at, organizer: "—", status: s.status, href: `/classes/${s.class_id}` });
  }


  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <p className="kicker text-brand-deep">Admin — Expired content</p>
      <h1 className="mt-1 font-display text-3xl font-bold text-ink">Expired content</h1>
      <p className="mt-1 text-sm text-mute">Everything date-bearing that has passed — searchable by type, date, and organizer. Browse surfaces hide these automatically; this archive is kept indefinitely — a member’s history is permanent.</p>

      <form className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-rule bg-surface p-4" method="get">
        <label className="flex flex-col gap-1 text-xs font-semibold text-mute">
          Type
          <select name="type" defaultValue={type} className="rounded-[10px] border border-rule-2 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand">
            {TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-mute">
          Expired from
          <input type="date" name="from" defaultValue={one("from") ?? ""} className="rounded-[10px] border border-rule-2 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-mute">
          To
          <input type="date" name="to" defaultValue={one("to") ?? ""} className="rounded-[10px] border border-rule-2 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand" />
        </label>
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs font-semibold text-mute">
          Organizer
          <input name="q" defaultValue={q} placeholder="Name…" className="rounded-[10px] border border-rule-2 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand" />
        </label>
        <button className="press rounded-[10px] bg-ink px-4 py-2.5 text-sm font-bold text-white hover:bg-[#2A2622]">Search</button>
      </form>

      <div className="mt-5 overflow-hidden rounded-2xl border border-rule bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-rule-soft bg-bg font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
            <tr>
              <th className="px-4 py-2.5">What</th>
              <th className="px-4 py-2.5">When</th>
              <th className="px-4 py-2.5">Organizer</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-mute">Nothing expired matches these filters.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.kind + r.id} className="border-b border-rule-soft last:border-0">
                  <td className="px-4 py-2.5"><span className="font-semibold text-ink">{r.title}</span> <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wide text-faint">{r.kind}</span></td>
                  <td className="px-4 py-2.5 text-mute"><Clock size={12} className="mr-1 inline text-faint" />{fmt(r.when)}</td>
                  <td className="px-4 py-2.5 text-mute">{r.organizer}</td>
                  <td className="px-4 py-2.5"><span className="rounded-md bg-bg px-2 py-0.5 font-mono text-[10.5px] text-mute">{r.status}</span></td>
                  <td className="px-4 py-2.5 text-right"><Link href={r.href} className="text-xs font-semibold text-brand-deep hover:underline">Open →</Link></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
