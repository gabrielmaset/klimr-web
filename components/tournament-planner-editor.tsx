"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Pencil, Check, Clock } from "lucide-react";
import { PLAN_KINDS, PLAN_KIND_LABEL, isoToLocalInput, localInputToIso, type PlanItemRow } from "@/lib/tournament";
import { saveTournamentPlan } from "@/app/tournaments/actions";

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

const fmtTime = (local: string) => (local ? new Date(local).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
const fmtDate = (local: string) => (local ? new Date(local).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) : "Unscheduled");

const inputCls = "w-full rounded-xl border border-rule bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-mute";

export function TournamentPlannerEditor({ tournamentId, initial, defaultDate }: { tournamentId: string; initial: PlanItemRow[]; defaultDate: string }) {
  const [items, setItems] = useState<Item[]>(() =>
    initial.map((r) => ({ key: r.id, id: r.id, title: r.title, kind: r.kind, starts: isoToLocalInput(r.starts_at), ends: isoToLocalInput(r.ends_at), notes: r.notes ?? "" })),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // new-item draft
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

  // group sorted items by day for the timeline
  const groups = useMemo(() => {
    const sorted = [...items].sort((a, b) => (a.starts || "9999").localeCompare(b.starts || "9999"));
    const map = new Map<string, Item[]>();
    for (const it of sorted) {
      const day = it.starts ? it.starts.slice(0, 10) : "—";
      const arr = map.get(day) ?? [];
      arr.push(it);
      map.set(day, arr);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-mute">{items.length} item{items.length === 1 ? "" : "s"} on the schedule</p>
        <div className="flex items-center gap-2.5">
          {err ? <span className="text-xs font-semibold text-brand-deep">{err}</span> : savedAt ? <span className="text-xs text-faint">Saved {savedAt}</span> : dirty ? <span className="text-xs text-faint">Unsaved changes</span> : null}
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save plan
          </button>
        </div>
      </div>

      {/* timeline */}
      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-rule bg-surface p-8 text-center">
          <Clock size={22} className="mx-auto text-faint" />
          <p className="mt-2 text-base font-bold text-ink">Build your run-of-show</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-mute">Add the first thing that happens on event day below — setup, food, games, music, awards — and it&rsquo;ll lay out on a timeline.</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {groups.map(([day, dayItems]) => (
            <section key={day}>
              <h2 className="mb-3 text-sm font-bold text-ink">{fmtDate(dayItems[0].starts)}</h2>
              <ol className="relative ml-1 border-l border-rule pl-5">
                {dayItems.map((it) => {
                  const color = KIND_COLOR[it.kind] ?? KIND_COLOR.general;
                  const isEditing = editing === it.key;
                  return (
                    <li key={it.key} className="relative mb-3 last:mb-0">
                      <span className="absolute -left-[26px] top-3 grid h-3.5 w-3.5 place-items-center rounded-full ring-4 ring-bg" style={{ background: color }} />
                      <div className="rounded-2xl border border-rule bg-surface p-3.5">
                        {isEditing ? (
                          <div className="grid gap-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="sm:col-span-2">
                                <label className={labelCls}>What</label>
                                <input className={inputCls} value={it.title} onChange={(e) => patch(it.key, { title: e.target.value })} placeholder="e.g. Games start" />
                              </div>
                              <div>
                                <label className={labelCls}>Type</label>
                                <select className={inputCls} value={it.kind} onChange={(e) => patch(it.key, { kind: e.target.value })}>
                                  {PLAN_KINDS.map((k) => (
                                    <option key={k} value={k}>{PLAN_KIND_LABEL[k]}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className={labelCls}>Start</label>
                                  <input type="datetime-local" className={inputCls} value={it.starts} onChange={(e) => patch(it.key, { starts: e.target.value })} />
                                </div>
                                <div>
                                  <label className={labelCls}>End</label>
                                  <input type="datetime-local" className={inputCls} value={it.ends} onChange={(e) => patch(it.key, { ends: e.target.value })} />
                                </div>
                              </div>
                              <div className="sm:col-span-2">
                                <label className={labelCls}>Notes</label>
                                <input className={inputCls} value={it.notes} onChange={(e) => patch(it.key, { notes: e.target.value })} placeholder="Optional details" />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <button type="button" onClick={() => remove(it.key)} className="press inline-flex items-center gap-1 text-xs font-semibold text-mute hover:text-brand-deep">
                                <Trash2 size={13} /> Remove
                              </button>
                              <button type="button" onClick={() => setEditing(null)} className="press inline-flex items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-pop">
                                <Check size={13} /> Done
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold tabular-nums text-ink">
                                  {fmtTime(it.starts)}
                                  {it.ends ? ` – ${fmtTime(it.ends)}` : ""}
                                </span>
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: `${color}1a`, color }}>
                                  {PLAN_KIND_LABEL[it.kind] ?? it.kind}
                                </span>
                              </div>
                              <p className="mt-0.5 text-sm font-semibold text-ink">{it.title || "Untitled"}</p>
                              {it.notes ? <p className="mt-0.5 text-xs text-mute">{it.notes}</p> : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button type="button" onClick={() => setEditing(it.key)} aria-label="Edit" className="press grid h-7 w-7 place-items-center rounded-lg text-faint hover:bg-bg hover:text-ink">
                                <Pencil size={13} />
                              </button>
                              <button type="button" onClick={() => remove(it.key)} aria-label="Remove" className="press grid h-7 w-7 place-items-center rounded-lg text-faint hover:bg-bg hover:text-brand-deep">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      {/* add */}
      <div className="rounded-3xl border border-rule bg-surface p-4 sm:p-5">
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Start</label>
              <input type="datetime-local" className={inputCls} value={draft.starts} onChange={(e) => setDraft({ ...draft, starts: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>End (optional)</label>
              <input type="datetime-local" className={inputCls} value={draft.ends} onChange={(e) => setDraft({ ...draft, ends: e.target.value })} />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Notes (optional)</label>
            <input className={inputCls} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Anything useful — vendor name, contact, location…" />
          </div>
        </div>
        <button
          type="button"
          onClick={addDraft}
          disabled={!draft.title.trim() || !draft.starts}
          className="press mt-3 inline-flex items-center gap-1.5 rounded-xl border border-rule bg-bg px-4 py-2 text-sm font-semibold text-ink hover:border-brand disabled:opacity-50"
        >
          <Plus size={15} /> Add item
        </button>
        <p className="mt-2 text-xs text-faint">Items are added to the timeline above. Remember to <span className="font-semibold text-mute">Save plan</span> when you&rsquo;re done.</p>
      </div>
    </div>
  );
}
