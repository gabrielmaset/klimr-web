"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Check, Clock } from "lucide-react";
import { PLAN_KINDS, PLAN_KIND_LABEL, isoToLocalInput, localInputToIso, type PlanItemRow } from "@/lib/tournament";
import { saveTournamentPlan } from "@/app/tournaments/actions";
import { DateTimeField } from "@/components/date-time-field";

const KIND_COLOR: Record<string, string> = {
  general: "#71717a",
  games: "#ff4e1b",
  food: "#16a34a",
  sponsor: "#2563eb",
  music: "#a21caf",
  setup: "#b8860b",
  ceremony: "#0e7490",
  staff: "#475569",
};

type Item = { key: string; id?: string; title: string; kind: string; starts: string; ends: string; notes: string };

let SEQ = 0;
const newKey = () => `tmp-${SEQ++}`;

const minsOf = (local: string) => {
  if (!local) return 0;
  const t = local.split("T")[1] ?? "00:00";
  const [h, m] = t.split(":").map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
};
const fmtTime = (local: string) => (local ? new Date(local).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
const fmtDate = (local: string) => (local ? new Date(local).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) : "Unscheduled");
const hourLabel = (h: number) => {
  const x = h % 24;
  const h12 = x % 12 === 0 ? 12 : x % 12;
  return `${h12} ${x < 12 ? "AM" : "PM"}`;
};

const PX_PER_HOUR = 54;

const inputCls = "w-full rounded-xl border border-rule bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-mute";

// Pack a day's items into lanes so overlapping blocks sit side-by-side.
function placeDay(dayItems: Item[]) {
  const sorted = [...dayItems].sort((a, b) => minsOf(a.starts) - minsOf(b.starts));
  const spans = sorted.map((it) => {
    const s = minsOf(it.starts);
    const e = it.ends ? Math.max(minsOf(it.ends), s + 30) : s + 45;
    return { it, s, e };
  });
  const laneEnds: number[] = [];
  const placed = spans.map((sp) => {
    let lane = laneEnds.findIndex((end) => end <= sp.s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(sp.e);
    } else {
      laneEnds[lane] = sp.e;
    }
    return { ...sp, lane };
  });
  const lanes = Math.max(1, laneEnds.length);
  const minMin = spans.length ? Math.min(...spans.map((s) => s.s)) : 9 * 60;
  const maxMin = spans.length ? Math.max(...spans.map((s) => s.e)) : 17 * 60;
  const startH = Math.max(0, Math.floor(minMin / 60));
  const endH = Math.min(24, Math.ceil(maxMin / 60));
  const hours: number[] = [];
  for (let h = startH; h <= endH; h++) hours.push(h);
  return { placed, lanes, startH, endH, hours };
}

export function TournamentPlannerEditor({ tournamentId, initial, defaultDate }: { tournamentId: string; initial: PlanItemRow[]; defaultDate: string }) {
  const [items, setItems] = useState<Item[]>(() =>
    initial.map((r) => ({ key: r.id, id: r.id, title: r.title, kind: r.kind, starts: isoToLocalInput(r.starts_at), ends: isoToLocalInput(r.ends_at), notes: r.notes ?? "" })),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [draft, setDraft] = useState({ title: "", kind: "general", starts: `${defaultDate}T09:00`, ends: "", notes: "" });

  function mutate(fn: (prev: Item[]) => Item[]) {
    setItems(fn);
    setDirty(true);
    setSavedAt(null);
  }
  function addDraft() {
    if (!draft.title.trim() || !draft.starts) return;
    mutate((prev) => [...prev, { key: newKey(), title: draft.title.trim(), kind: draft.kind, starts: draft.starts, ends: draft.ends, notes: draft.notes }]);
    setDraft({ title: "", kind: "general", starts: draft.starts, ends: "", notes: "" });
  }
  function patch(key: string, p: Partial<Item>) {
    mutate((prev) => prev.map((it) => (it.key === key ? { ...it, ...p } : it)));
  }
  function remove(key: string) {
    mutate((prev) => prev.filter((it) => it.key !== key));
    if (editing === key) setEditing(null);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    const payload = items
      .filter((it) => it.starts)
      .map((it, i) => ({ id: it.id, title: it.title, kind: it.kind, starts_at: localInputToIso(it.starts), ends_at: it.ends ? localInputToIso(it.ends) : null, notes: it.notes.trim() || null, sort_order: i }));
    const res = await saveTournamentPlan(tournamentId, payload);
    if (res.ok) {
      setItems(res.items.map((r) => ({ key: r.id, id: r.id, title: r.title, kind: r.kind, starts: isoToLocalInput(r.starts_at), ends: isoToLocalInput(r.ends_at), notes: r.notes ?? "" })));
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      setDirty(false);
      setEditing(null);
    } else {
      setErr(res.error ?? "Couldn't save.");
    }
    setSaving(false);
  }

  const kindCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.kind, (m.get(it.kind) ?? 0) + 1);
    return m;
  }, [items]);

  const groups = useMemo(() => {
    const shown = filter === "all" ? items : items.filter((it) => it.kind === filter);
    const sorted = [...shown].sort((a, b) => (a.starts || "9999").localeCompare(b.starts || "9999"));
    const map = new Map<string, Item[]>();
    for (const it of sorted) {
      const day = it.starts ? it.starts.slice(0, 10) : "—";
      const arr = map.get(day) ?? [];
      arr.push(it);
      map.set(day, arr);
    }
    return [...map.entries()];
  }, [items, filter]);

  const editingItem = items.find((it) => it.key === editing) ?? null;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mute">
          {items.length} item{items.length === 1 ? "" : "s"} on the schedule
        </p>
        <div className="flex items-center gap-2.5">
          {err ? <span className="text-xs font-semibold text-brand-deep">{err}</span> : savedAt ? <span className="text-xs text-faint">Saved {savedAt}</span> : dirty ? <span className="text-xs text-faint">Unsaved changes</span> : null}
          <button type="button" onClick={save} disabled={saving || !dirty} className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save plan
          </button>
        </div>
      </div>

      {/* type filter */}
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${filter === "all" ? "bg-ink text-surface" : "border border-rule bg-surface text-mute hover:text-ink"}`}
          >
            All ({items.length})
          </button>
          {PLAN_KINDS.filter((k) => kindCounts.get(k)).map((k) => {
            const color = KIND_COLOR[k] ?? KIND_COLOR.general;
            const active = filter === k;
            return (
              <button
                type="button"
                key={k}
                onClick={() => setFilter(k)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${active ? "text-surface" : "border border-rule bg-surface text-mute hover:text-ink"}`}
                style={active ? { background: color } : undefined}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: active ? "#fff" : color }} />
                {PLAN_KIND_LABEL[k]} ({kindCounts.get(k)})
              </button>
            );
          })}
        </div>
      ) : null}

      {/* calendar */}
      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-rule bg-surface p-8 text-center">
          <Clock size={22} className="mx-auto text-faint" />
          <p className="mt-2 text-base font-bold text-ink">Build your run-of-show</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-mute">Add the first thing that happens on event day below — setup, food, games, music, awards — and it&rsquo;ll lay out on the day calendar.</p>
        </div>
      ) : groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-rule bg-surface px-4 py-6 text-center text-sm text-mute">No {filter !== "all" ? PLAN_KIND_LABEL[filter]?.toLowerCase() : ""} items.</p>
      ) : (
        <div className="grid gap-6">
          {groups.map(([day, dayItems]) => {
            const { placed, lanes, startH, hours } = placeDay(dayItems);
            return (
              <section key={day} className="rounded-3xl border border-rule bg-surface shadow-e1 p-4 sm:p-5">
                <h2 className="mb-3 text-sm font-bold text-ink">{fmtDate(dayItems[0].starts)}</h2>
                <div className="relative" style={{ height: hours.length ? (hours[hours.length - 1] - startH) * PX_PER_HOUR + 8 : 0 }}>
                  {hours.map((h) => (
                    <div key={h} className="absolute inset-x-0 border-t border-rule/60" style={{ top: (h - startH) * PX_PER_HOUR }}>
                      <span className="absolute -top-2 left-0 bg-surface pr-1 text-[10px] font-semibold tabular-nums text-faint">{hourLabel(h)}</span>
                    </div>
                  ))}
                  <div className="absolute bottom-0 left-14 right-0 top-0">
                    {placed.map(({ it, s, e, lane }) => {
                      const color = KIND_COLOR[it.kind] ?? KIND_COLOR.general;
                      const top = ((s - startH * 60) / 60) * PX_PER_HOUR;
                      const height = Math.max(((e - s) / 60) * PX_PER_HOUR - 4, 30);
                      const w = 100 / lanes;
                      const active = editing === it.key;
                      return (
                        <button
                          type="button"
                          key={it.key}
                          onClick={() => setEditing(active ? null : it.key)}
                          className={`absolute overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left shadow-sm transition hover:shadow ${active ? "ring-2 ring-brand" : ""}`}
                          style={{ top, height, left: `calc(${lane * w}% + 2px)`, width: `calc(${w}% - 4px)`, borderLeftColor: color, background: `${color}14` }}
                        >
                          <span className="block truncate text-[11px] font-bold tabular-nums" style={{ color }}>
                            {fmtTime(it.starts)}
                            {it.ends ? `–${fmtTime(it.ends)}` : ""}
                          </span>
                          <span className="block truncate text-xs font-semibold text-ink">{it.title || "Untitled"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* edit selected */}
      {editingItem ? (
        <div className="rounded-3xl border border-brand/40 bg-surface p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">Edit item</h3>
            <button type="button" onClick={() => remove(editingItem.key)} className="press inline-flex items-center gap-1 text-xs font-semibold text-mute hover:text-brand-deep">
              <Trash2 size={13} /> Remove
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>What</label>
              <input className={inputCls} value={editingItem.title} onChange={(e) => patch(editingItem.key, { title: e.target.value })} placeholder="e.g. Games start" />
            </div>
            <div>
              <label className={labelCls}>Type</label>
              <select className={inputCls} value={editingItem.kind} onChange={(e) => patch(editingItem.key, { kind: e.target.value })}>
                {PLAN_KINDS.map((k) => (
                  <option key={k} value={k}>{PLAN_KIND_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Start</label>
              <DateTimeField value={editingItem.starts} onChange={(v) => patch(editingItem.key, { starts: v })} ariaLabel="Item start" />
            </div>
            <div>
              <label className={labelCls}>End <span className="font-normal normal-case text-faint">(optional)</span></label>
              <DateTimeField value={editingItem.ends} onChange={(v) => patch(editingItem.key, { ends: v })} optional ariaLabel="Item end" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Notes</label>
              <input className={inputCls} value={editingItem.notes} onChange={(e) => patch(editingItem.key, { notes: e.target.value })} placeholder="Optional details" />
            </div>
          </div>
          <button type="button" onClick={() => setEditing(null)} className="press mt-3 inline-flex items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-surface">
            <Check size={13} /> Done
          </button>
        </div>
      ) : null}

      {/* add */}
      <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-ink">Add to the plan</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>What&rsquo;s happening</label>
            <input className={inputCls} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Food trucks arrive, DJ starts, Opening ceremony" />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select className={inputCls} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
              {PLAN_KINDS.map((k) => (
                <option key={k} value={k}>{PLAN_KIND_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Start</label>
            <DateTimeField value={draft.starts} onChange={(v) => setDraft({ ...draft, starts: v })} ariaLabel="New item start" />
          </div>
          <div className="sm:col-span-2 sm:col-start-2">
            <label className={labelCls}>End <span className="font-normal normal-case text-faint">(optional)</span></label>
            <DateTimeField value={draft.ends} onChange={(v) => setDraft({ ...draft, ends: v })} optional ariaLabel="New item end" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Notes (optional)</label>
            <input className={inputCls} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Anything useful — vendor name, contact, location…" />
          </div>
        </div>
        <button type="button" onClick={addDraft} disabled={!draft.title.trim() || !draft.starts} className="press mt-3 inline-flex items-center gap-1.5 rounded-xl border border-rule bg-bg px-4 py-2 text-sm font-semibold text-ink hover:border-brand disabled:opacity-50">
          <Plus size={15} /> Add item
        </button>
        <p className="mt-2 text-xs text-faint">Items appear on the day calendar above. Remember to <span className="font-semibold text-mute">Save plan</span> when you&rsquo;re done.</p>
      </div>
    </div>
  );
}
