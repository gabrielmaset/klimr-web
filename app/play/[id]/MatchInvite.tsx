"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search, UserPlus, Check, Loader2, Users } from "lucide-react";
import { inviteToMatch } from "./actions";
import { Avatar } from "@/components/avatar";

type Friend = { id: string; display_name: string; avatar_hue: number; avatar_url: string | null; city: string | null };

export function MatchInvite({ matchId, friends }: { matchId: string; friends: Friend[] }) {
  const [q, setQ] = useState("");
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return friends
      .filter((f) => !invited.has(f.id))
      .filter((f) => (term ? f.display_name.toLowerCase().includes(term) : true));
  }, [q, friends, invited]);

  function invite(id: string) {
    const fd = new FormData();
    fd.set("matchId", matchId);
    fd.set("userId", id);
    startTransition(async () => {
      await inviteToMatch(fd);
      setInvited((s) => new Set(s).add(id));
    });
  }

  if (friends.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-rule bg-surface p-6 text-center">
        <Users size={22} className="mx-auto text-faint" />
        <p className="mt-2 text-sm font-semibold text-ink">Invite friends to fill this match</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-mute">
          You don&rsquo;t have any friends to invite yet. Connect with players from their profile, then invite them straight to a match.
        </p>
        <Link href="/network" className="press mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
          <UserPlus size={14} /> Find players
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs text-mute">Invite players you&rsquo;re friends with. They&rsquo;ll get a notification to accept and join your roster.</p>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your friends…"
          className="h-10 w-full rounded-xl border border-rule bg-surface pl-9 pr-3 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
        />
      </div>

      {visible.length === 0 ? (
        <p className="mt-2 text-sm text-mute">
          {q.trim() ? `No friends match “${q.trim()}”.` : "Everyone you're friends with is already on this match or invited."}
        </p>
      ) : (
        <div className="mt-2 max-h-80 divide-y divide-rule overflow-y-auto rounded-2xl border border-rule bg-surface">
          {visible.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar url={p.avatar_url} hue={p.avatar_hue ?? 200} name={p.display_name} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{p.display_name || "Player"}</span>
                {p.city ? <span className="block truncate text-xs text-mute">{p.city}</span> : null}
              </span>
              <button
                type="button"
                onClick={() => invite(p.id)}
                disabled={pending}
                className="press inline-flex items-center gap-1 rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-bg disabled:opacity-60"
              >
                {pending ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Invite
              </button>
            </div>
          ))}
        </div>
      )}

      {invited.size > 0 ? (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-success">
          <Check size={12} /> Invitation{invited.size > 1 ? "s" : ""} sent.
        </p>
      ) : null}
    </div>
  );
}
