"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Trash2, Plus, Pin, CircleAlert } from "lucide-react";
import { saveAnnouncements } from "@/app/tournaments/actions";
import type { Announcement } from "@/lib/tournament";

const MAX = 60;

type Row = { id: string; title: string; body: string; pinned: boolean; createdAt: string };

function uid() {
  return `a_${Math.random().toString(36).slice(2, 10)}`;
}
function toRow(a: Announcement): Row {
  return { id: a.id || uid(), title: a.title ?? "", body: a.body ?? "", pinned: !!a.pinned, createdAt: a.createdAt || new Date().toISOString() };
}

export function AnnouncementsEditor({ tournamentId, initial }: { tournamentId: string; initial: Announcement[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial.map(toRow));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  function add() {
    if (rows.length >= MAX) return;
    setRows((rs) => [{ id: uid(), title: "", body: "", pinned: false, createdAt: new Date().toISOString() }, ...rs]);
  }
  function remove(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    const payload: Announcement[] = rows.map((r) => ({ id: r.id, title: r.title, body: r.body, pinned: r.pinned, createdAt: r.createdAt }));
    const res = await saveAnnouncements(tournamentId, payload);
    if (res.ok) {
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      setRows((res.announcements ?? []).map(toRow));
      router.refresh();
    } else setErr(res.error ?? "Couldn't save.");
    setSaving(false);
  }

  const inputCls = "w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand";

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-3 text-xs text-mute">
        Post updates for players and followers — schedule releases, weather calls, last-minute changes. They appear on your public event page, newest first. Pin one to keep it on top.
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-8 text-center text-sm text-mute">No announcements yet — post your first below.</p>
      ) : (
        <div className="grid gap-4">
          {rows.map((r) => (
            <div key={r.id} className={`rounded-2xl border bg-surface p-4 sm:p-5 ${r.pinned ? "border-brand/40" : "border-rule"}`}>
              <div className="flex items-start gap-2">
                <input className={`${inputCls} font-semibold`} value={r.title} onChange={(e) => patch(r.id, { title: e.target.value })} placeholder="Title — e.g. Schedule is live" />
                <button
                  type="button"
                  onClick={() => patch(r.id, { pinned: !r.pinned })}
                  aria-pressed={r.pinned}
                  title={r.pinned ? "Unpin" : "Pin to top"}
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${r.pinned ? "border-brand bg-tint-brand text-brand-deep" : "border-rule bg-bg text-mute hover:text-ink"}`}
                >
                  <Pin size={15} className={r.pinned ? "fill-current" : ""} />
                </button>
                <button type="button" onClick={() => remove(r.id)} aria-label="Delete announcement" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rule bg-bg text-mute transition hover:text-ink">
                  <Trash2 size={15} />
                </button>
              </div>
              <textarea className={`${inputCls} mt-3 min-h-24 resize-y`} value={r.body} onChange={(e) => patch(r.id, { body: e.target.value })} placeholder="Write your update…" />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} disabled={rows.length >= MAX} className="press inline-flex items-center gap-1.5 rounded-xl border border-rule bg-bg px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand disabled:opacity-50">
          <Plus size={15} /> New announcement
        </button>
        <button type="button" onClick={save} disabled={saving} className="press inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save announcements
        </button>
        {savedAt ? <span className="text-xs font-medium text-success">Saved {savedAt}</span> : null}
      </div>
      {err ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-deep">
          <CircleAlert size={13} /> {err}
        </p>
      ) : null}
    </div>
  );
}
