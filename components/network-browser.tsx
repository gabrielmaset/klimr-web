"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Search, BadgeCheck, Users, UserPlus, UserCheck, ArrowUpDown, X, Rss, Check, Clock, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { followUser, unfollowUser, sendFriendRequest, acceptFriendRequest, removeFriend } from "@/app/network/actions";

export type Tab = "friends" | "following" | "followers";
export type FriendStatus = "none" | "requested" | "incoming" | "friends";
export type SortKey = "az" | "za" | "newest" | "oldest";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "az", label: "Name (A–Z)" },
  { key: "za", label: "Name (Z–A)" },
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
];

// Date sorts fall back to name so same-timestamp rows stay stable (and readable).
const SORTERS: Record<SortKey, (a: Person, b: Person) => number> = {
  az: (a, b) => a.name.localeCompare(b.name),
  za: (a, b) => b.name.localeCompare(a.name),
  newest: (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime() || a.name.localeCompare(b.name),
  oldest: (a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime() || a.name.localeCompare(b.name),
};
export type Person = {
  id: string;
  name: string;
  avatarUrl: string | null;
  hue: number;
  verified: boolean;
  sportKey: string | null;
  sportName: string | null;
  sportEmoji: string | null;
  place: string | null;
  addedAt: string;
  isFriend: boolean;
  iFollow: boolean;
  followsMe: boolean;
  friendStatus: FriendStatus;
};

export function NetworkBrowser({
  friends: friends0,
  following: following0,
  followers: followers0,
  initialTab,
}: {
  friends: Person[];
  following: Person[];
  followers: Person[];
  initialTab: Tab;
}) {
  const [friends, setFriends] = useState(friends0);
  const [following, setFollowing] = useState(following0);
  const [followers, setFollowers] = useState(followers0);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState("");
  const [sport, setSport] = useState("all");
  const [sort, setSort] = useState<SortKey>("az");
  const [, startTransition] = useTransition();

  // optimistic flag updates, applied everywhere the person appears
  const patch = (id: string, partial: Partial<Person>) => {
    const upd = (xs: Person[]) => xs.map((p) => (p.id === id ? { ...p, ...partial } : p));
    setFriends(upd);
    setFollowing(upd);
    setFollowers(upd);
  };
  const run = (fn: (fd: FormData) => Promise<void>, id: string) => {
    const fd = new FormData();
    fd.set("userId", id);
    startTransition(async () => {
      try {
        await fn(fd);
      } catch {
        /* optimistic UI; a refresh reconciles if the server rejected */
      }
    });
  };
  const onFollow = (p: Person) => {
    const next = !p.iFollow;
    patch(p.id, { iFollow: next });
    run(next ? followUser : unfollowUser, p.id);
  };
  const onFriend = (p: Person) => {
    if (p.friendStatus === "none") {
      patch(p.id, { friendStatus: "requested" });
      run(sendFriendRequest, p.id);
    } else if (p.friendStatus === "requested") {
      patch(p.id, { friendStatus: "none" });
      run(removeFriend, p.id);
    } else if (p.friendStatus === "incoming") {
      patch(p.id, { friendStatus: "friends", isFriend: true });
      run(acceptFriendRequest, p.id);
    } else {
      patch(p.id, { friendStatus: "none", isFriend: false });
      run(removeFriend, p.id);
    }
  };

  const lists: Record<Tab, Person[]> = { friends, following, followers };
  const active = lists[tab];

  const sports = useMemo(() => {
    const s = new Map<string, { key: string; emoji: string; name: string }>();
    for (const p of active) if (p.sportKey && p.sportName && p.sportEmoji) s.set(p.sportKey, { key: p.sportKey, emoji: p.sportEmoji, name: p.sportName });
    return [...s.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [active]);

  const filtered = useMemo(() => {
    let out = active;
    if (sport !== "all") out = out.filter((p) => p.sportKey === sport);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter((p) => p.name.toLowerCase().includes(needle) || (p.place ?? "").toLowerCase().includes(needle));
    }
    return [...out].sort(SORTERS[sort]);
  }, [active, q, sport, sort]);

  const TABS: { key: Tab; label: string; n: number }[] = [
    { key: "friends", label: "Friends", n: friends.length },
    { key: "following", label: "Following", n: following.length },
    { key: "followers", label: "Followers", n: followers.length },
  ];

  return (
    <div>
      <div className="mb-4 inline-flex rounded-full border border-rule bg-surface p-1">
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setSport("all");
              }}
              className={`press rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${on ? "bg-ink text-white" : "text-mute hover:text-ink"}`}
            >
              {t.label} <span className={on ? "text-white/65" : "text-faint"}>{t.n}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${tab} by name…`}
            className="w-full rounded-2xl border border-rule bg-surface py-2.5 pl-10 pr-9 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-faint hover:bg-bg hover:text-ink">
              <X size={14} />
            </button>
          ) : null}
        </div>
        <SortMenu value={sort} onChange={setSort} />
      </div>

      {sports.length > 1 ? (
        <div className="mb-5 flex flex-wrap gap-1.5">
          <Chip on={sport === "all"} onClick={() => setSport("all")}>
            All sports
          </Chip>
          {sports.map((s) => (
            <Chip key={s.key} on={sport === s.key} onClick={() => setSport(s.key)}>
              {s.emoji} {s.name}
            </Chip>
          ))}
        </div>
      ) : null}

      <p className="mb-3 text-xs text-faint">
        {filtered.length} {filtered.length === 1 ? "person" : "people"}
        {sport !== "all" || q ? " match" : ""}
      </p>

      {active.length === 0 ? (
        <EmptyState tab={tab} />
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-rule bg-surface/50 p-12 text-center">
          <p className="text-sm font-semibold text-ink">No matches</p>
          <p className="mt-1 text-xs text-mute">Try a different name, or clear the filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <PersonCard key={p.id} p={p} tab={tab} onFollow={onFollow} onFriend={onFriend} />
          ))}
        </div>
      )}
    </div>
  );
}

function PersonCard({ p, tab, onFollow, onFriend }: { p: Person; tab: Tab; onFollow: (p: Person) => void; onFriend: (p: Person) => void }) {
  const sub = [p.sportName, p.place].filter(Boolean).join(" · ");
  const showsFollowsYou = p.followsMe && tab !== "followers";

  return (
    <div className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-3.5">
      <Link href={`/profile/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3.5">
        <Avatar url={p.avatarUrl} hue={p.hue} name={p.name} size={50} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-ink">{p.name}</span>
            {p.verified ? <BadgeCheck size={14} className="shrink-0 text-brand" aria-label="Verified" /> : null}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-mute">
            {p.sportEmoji ? <span className="shrink-0">{p.sportEmoji}</span> : null}
            <span className="truncate">{sub || "\u2014"}</span>
          </div>
          {showsFollowsYou ? <span className="mt-1.5 inline-block rounded-full bg-[#eef0ff] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#4f46e5]">Follows you</span> : null}
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-1.5">
        <FriendButton status={p.friendStatus} onClick={() => onFriend(p)} />
        <FollowButton following={p.iFollow} onClick={() => onFollow(p)} />
      </div>
    </div>
  );
}

const btnBase = "press grid h-9 w-9 place-items-center rounded-full border transition-colors";

function FollowButton({ following, onClick }: { following: boolean; onClick: () => void }) {
  return following ? (
    <button type="button" onClick={onClick} aria-label="Unfollow" title="Following \u2014 tap to unfollow" className={`${btnBase} border-transparent bg-brand text-white hover:bg-brand-deep`}>
      <Check size={16} />
    </button>
  ) : (
    <button type="button" onClick={onClick} aria-label="Follow" title="Follow" className={`${btnBase} border-rule text-mute hover:border-brand/50 hover:text-brand-deep`}>
      <Rss size={15} />
    </button>
  );
}

function FriendButton({ status, onClick }: { status: FriendStatus; onClick: () => void }) {
  if (status === "friends")
    return (
      <button type="button" onClick={onClick} aria-label="Remove friend" title="Friends \u2014 tap to remove" className={`${btnBase} border-transparent bg-success text-white hover:opacity-90`}>
        <UserCheck size={16} />
      </button>
    );
  if (status === "incoming")
    return (
      <button type="button" onClick={onClick} aria-label="Accept friend request" title="Accept friend request" className={`${btnBase} border-transparent bg-ink text-white hover:bg-ink-soft`}>
        <UserPlus size={16} />
      </button>
    );
  if (status === "requested")
    return (
      <button type="button" onClick={onClick} aria-label="Cancel friend request" title="Request sent \u2014 tap to cancel" className={`${btnBase} border-rule text-faint hover:text-ink`}>
        <Clock size={15} />
      </button>
    );
  return (
    <button type="button" onClick={onClick} aria-label="Add friend" title="Add friend" className={`${btnBase} border-rule text-mute hover:border-brand/50 hover:text-brand-deep`}>
      <UserPlus size={16} />
    </button>
  );
}

function SortMenu({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const current = SORT_OPTIONS.find((o) => o.key === value) ?? SORT_OPTIONS[0];
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="press inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-rule bg-surface px-4 py-2.5 text-sm font-semibold text-mute transition-colors hover:text-ink sm:w-auto"
      >
        <ArrowUpDown size={15} /> {current.label}
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <>
          <button type="button" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
          <div role="listbox" className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-rule bg-surface p-1 shadow-[0_18px_40px_-20px_rgba(10,10,11,0.35)]">
            {SORT_OPTIONS.map((o) => {
              const on = o.key === value;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onChange(o.key);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${on ? "bg-bg text-ink" : "text-mute hover:bg-bg hover:text-ink"}`}
                >
                  {o.label}
                  {on ? <Check size={14} className="text-brand" /> : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? "border-brand bg-brand text-white" : "border-rule bg-surface text-mute hover:border-brand/50 hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const msg =
    tab === "friends"
      ? "No friends yet. Add players from their profile \u2014 they'll appear here once they accept."
      : tab === "following"
        ? "You're not following anyone yet. Follow a player to track their climb."
        : "No followers yet. As you play and post, players will start following you.";
  return (
    <div className="rounded-3xl border border-dashed border-rule bg-surface/50 p-12 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-tint-brand text-brand-deep">
        <Users size={22} />
      </span>
      <p className="mx-auto mt-3 max-w-sm text-sm text-mute">{msg}</p>
      <Link href="/players" className="press mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
        <UserPlus size={15} /> Find players
      </Link>
    </div>
  );
}
