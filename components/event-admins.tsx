"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Shield, Crown, Search, X, Plus, Loader2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { searchEventAdminCandidates, setEventAdmin, unsetEventAdmin } from "@/app/events/actions";

type AdminRow = { id: string; name: string; hue: number; avatarUrl: string | null; isOwner: boolean };
type Candidate = { id: string; name: string; avatarUrl: string | null; hue: number; city: string | null };

export function EventAdmins({ eventId, isOwner, meId, initialAdmins }: { eventId: string; isOwner: boolean; meId: string; initialAdmins: AdminRow[] }) {
  const [admins, setAdmins] = useState<AdminRow[]>(initialAdmins);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  const onQuery = (val: string) => {
    setQ(val);
    setErr(null);
    if (debounce.current) clearTimeout(debounce.current);
    const query = val.trim();
    if (query.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(() => {
      searchEventAdminCandidates(eventId, query)
        .then((r) => setResults(r))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
  };

  const add = (c: Candidate) => {
    setErr(null);
    start(async () => {
      const res = await setEventAdmin(eventId, c.id);
      if (res?.error) {
        setErr(res.error);
        return;
      }
      setAdmins((cur) => (cur.some((a) => a.id === c.id) ? cur : [...cur, { id: c.id, name: c.name, hue: c.hue, avatarUrl: c.avatarUrl, isOwner: false }]));
      setQ("");
      setResults([]);
    });
  };

  const remove = (id: string) => {
    setErr(null);
    start(async () => {
      const res = await unsetEventAdmin(eventId, id);
      if (res?.error) {
        setErr(res.error);
        return;
      }
      setAdmins((cur) => cur.filter((a) => a.id !== id));
    });
  };

  return (
    <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <Shield size={15} className="text-[#0e7490]" />
        <h3 className="text-sm font-bold text-ink">Event admins</h3>
        <span className="ml-auto text-[11px] text-mute">
          {admins.length} {admins.length === 1 ? "person" : "people"}
        </span>
      </div>

      <ul className="space-y-2">
        {admins.map((a) => (
          <li key={a.id} className="flex items-center gap-2.5 rounded-2xl border border-rule bg-bg/40 px-3 py-2">
            <Avatar url={a.avatarUrl} hue={a.hue} name={a.name} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {a.name}
                {a.id === meId ? <span className="ml-1 text-[11px] font-medium text-faint">you</span> : null}
              </p>
              {a.isOwner ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-deep">
                  <Crown size={11} /> Organizer
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0e7490]">
                  <Shield size={11} /> Admin
                </span>
              )}
            </div>
            {a.isOwner ? null : isOwner ? (
              <button type="button" disabled={pending} onClick={() => remove(a.id)} className="press shrink-0 rounded-full border border-rule bg-white px-2.5 py-1 text-[11px] font-semibold text-mute hover:text-brand-deep disabled:opacity-50">
                Remove
              </button>
            ) : a.id === meId ? (
              <button type="button" disabled={pending} onClick={() => remove(a.id)} className="press shrink-0 rounded-full border border-rule bg-white px-2.5 py-1 text-[11px] font-semibold text-mute hover:text-brand-deep disabled:opacity-50">
                Step down
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {isOwner ? (
        <div className="mt-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Add an admin — search members by name"
              className="w-full rounded-full border border-rule bg-bg py-2.5 pl-9 pr-9 text-sm font-medium text-ink outline-none transition-colors focus:border-brand focus:bg-white"
            />
            {q ? (
              <button type="button" onClick={() => onQuery("")} aria-label="Clear" className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink">
                <X size={15} />
              </button>
            ) : null}
          </div>

          {q.trim().length >= 2 ? (
            <div className="mt-2 overflow-hidden rounded-2xl border border-rule bg-surface shadow-e1">
              {searching ? (
                <p className="flex items-center gap-2 px-3 py-3 text-sm text-mute">
                  <Loader2 size={14} className="animate-spin" /> Searching…
                </p>
              ) : results.length === 0 ? (
                <p className="px-3 py-3 text-sm text-faint">No matching members.</p>
              ) : (
                <ul className="divide-y divide-rule">
                  {results.map((c) => (
                    <li key={c.id} className="flex items-center gap-2.5 px-3 py-2">
                      <Avatar url={c.avatarUrl} hue={c.hue} name={c.name} size={30} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{c.name}</p>
                        {c.city ? <p className="truncate text-[11px] text-faint">{c.city}</p> : null}
                      </div>
                      <button type="button" disabled={pending} onClick={() => add(c)} className="press inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
                        <Plus size={13} /> Add
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-mute">Admins can edit the event and run the live queue. You can add any Klimr member — they don&rsquo;t need to be going.</p>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-mute">Only the organizer can add or remove admins.</p>
      )}

      {err ? <p className="mt-2 text-xs font-medium text-[#b91c1c]">{err}</p> : null}
    </div>
  );
}
