"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Inbox, BadgeCheck, Check, X, Clock, Swords } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { acceptFriendRequest, removeFriend } from "@/app/network/actions";
import { respondTeamInvite } from "@/app/teams/actions";
import { acceptMatchInvite, declineMatchInvite, cancelMatchInvite } from "@/app/play/[id]/actions";

export type Dir = "received" | "sent";
export type Kind = "all" | "friends" | "teams" | "matches";
type ItemKind = Exclude<Kind, "all">;

export type InviteItem = {
  key: string;
  dir: Dir;
  kind: ItemKind;
  title: string;
  sub: string | null;
  href: string;
  avatarUrl: string | null;
  hue: number;
  emoji: string | null; // null → render the person avatar; otherwise an emoji medallion
  verified: boolean;
  friendUserId: string | null;
  teamInviteId: string | null;
  matchInviteId: string | null;
  matchId: string | null;
  matchClosed: boolean;
};

type Run = "friendAccept" | "friendRemove" | "teamAccept" | "teamDecline" | "matchAccept" | "matchDecline" | "matchCancel";

const KIND_STYLE: Record<ItemKind, { accent: string; tint: string; ring: string }> = {
  friends: { accent: "#d63a0f", tint: "#fff4ef", ring: "#ffd9cb" },
  teams: { accent: "#4f46e5", tint: "#eef0ff", ring: "#c9cdf8" },
  matches: { accent: "#15803d", tint: "#effdf3", ring: "#bbf7d0" },
};

function kickerLabel(kind: ItemKind, dir: Dir): string {
  if (kind === "friends") return dir === "received" ? "Friend request" : "Friend invite sent";
  if (kind === "teams") return dir === "received" ? "Team invitation" : "Team invite sent";
  return dir === "received" ? "Match invite" : "Match invite sent";
}

const KINDS: { key: Kind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "matches", label: "Matches" },
  { key: "friends", label: "Friends" },
  { key: "teams", label: "Teams" },
];

export function InvitesBrowser({ items: items0, initialDir, initialKind }: { items: InviteItem[]; initialDir: Dir; initialKind: Kind }) {
  const [items, setItems] = useState(items0);
  const [dir, setDir] = useState<Dir>(initialDir);
  const [kind, setKind] = useState<Kind>(initialKind);
  const [, startTransition] = useTransition();

  const counts = useMemo(
    () => ({
      received: items.filter((i) => i.dir === "received").length,
      sent: items.filter((i) => i.dir === "sent").length,
    }),
    [items],
  );

  const filtered = useMemo(() => items.filter((i) => i.dir === dir && (kind === "all" || i.kind === kind)), [items, dir, kind]);

  const perform = (item: InviteItem, run: Run) => {
    setItems((xs) => xs.filter((x) => x.key !== item.key));
    const fd = new FormData();
    let fn: (f: FormData) => Promise<void>;
    switch (run) {
      case "friendAccept":
        fd.set("userId", item.friendUserId ?? "");
        fn = acceptFriendRequest;
        break;
      case "friendRemove":
        fd.set("userId", item.friendUserId ?? "");
        // Declining someone's request (received) arms the re-request cooldown;
        // canceling my own sent request must not.
        fd.set("declined", item.dir === "received" ? "1" : "0");
        fn = removeFriend;
        break;
      case "teamAccept":
        fd.set("inviteId", item.teamInviteId ?? "");
        fd.set("decision", "accept");
        fn = respondTeamInvite;
        break;
      case "teamDecline":
        fd.set("inviteId", item.teamInviteId ?? "");
        fd.set("decision", "decline");
        fn = respondTeamInvite;
        break;
      case "matchAccept":
        fd.set("inviteId", item.matchInviteId ?? "");
        fn = acceptMatchInvite;
        break;
      case "matchDecline":
        fd.set("inviteId", item.matchInviteId ?? "");
        fn = declineMatchInvite;
        break;
      case "matchCancel":
        fd.set("inviteId", item.matchInviteId ?? "");
        fd.set("matchId", item.matchId ?? "");
        fn = cancelMatchInvite;
        break;
    }
    startTransition(async () => {
      try {
        await fn(fd);
      } catch {
        /* optimistic; a refresh reconciles if the server rejected */
      }
    });
  };

  const TABS: { key: Dir; label: string; n: number }[] = [
    { key: "received", label: "Received", n: counts.received },
    { key: "sent", label: "Sent", n: counts.sent },
  ];

  return (
    <div>
      {/* direction tabs */}
      <div className="mb-3 inline-flex rounded-full border border-rule bg-surface p-1">
        {TABS.map((t) => {
          const on = t.key === dir;
          return (
            <button key={t.key} type="button" onClick={() => setDir(t.key)} className={`press rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${on ? "bg-ink text-white" : "text-mute hover:text-ink"}`}>
              {t.label} <span className={on ? "text-white/65" : "text-faint"}>{t.n}</span>
            </button>
          );
        })}
      </div>

      {/* kind filter */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {KINDS.map((k) => {
          const on = k.key === kind;
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={`press rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? "border-brand bg-tint-brand text-brand-deep" : "border-rule bg-surface text-mute hover:border-brand/40 hover:text-ink"}`}
            >
              {k.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-rule bg-surface/50 p-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-tint-brand text-brand-deep">
            <Inbox size={22} />
          </span>
          <p className="mx-auto mt-3 max-w-sm text-sm text-mute">
            {dir === "received" ? "No pending invites. Match invites, friend requests, and team invitations will show up here." : "You haven't sent any pending invites."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <InviteCard key={item.key} item={item} perform={perform} />
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-xs text-faint">Connect with players to invite them to teams and matches.</p>
    </div>
  );
}

const ACCEPT = "press inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep";
const OUTLINE = "press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink";
const INFO = "inline-flex items-center gap-1.5 text-xs text-faint";

function InviteActions({ item, perform }: { item: InviteItem; perform: (i: InviteItem, r: Run) => void }) {
  if (item.kind === "friends") {
    return item.dir === "received" ? (
      <>
        <button type="button" onClick={() => perform(item, "friendAccept")} className={ACCEPT}>
          <Check size={15} /> Accept
        </button>
        <button type="button" onClick={() => perform(item, "friendRemove")} className={OUTLINE}>
          <X size={15} /> Decline
        </button>
      </>
    ) : (
      <button type="button" onClick={() => perform(item, "friendRemove")} className={OUTLINE}>
        <Clock size={14} /> Cancel request
      </button>
    );
  }
  if (item.kind === "teams") {
    return item.dir === "received" ? (
      <>
        <button type="button" onClick={() => perform(item, "teamAccept")} className={ACCEPT}>
          <Check size={15} /> Accept
        </button>
        <button type="button" onClick={() => perform(item, "teamDecline")} className={OUTLINE}>
          <X size={15} /> Decline
        </button>
      </>
    ) : (
      <span className={INFO}>
        <Clock size={13} /> Awaiting response
      </span>
    );
  }
  // matches
  if (item.dir === "sent")
    return (
      <button type="button" onClick={() => perform(item, "matchCancel")} className={OUTLINE}>
        <Clock size={14} /> Cancel invite
      </button>
    );
  if (item.matchClosed)
    return (
      <span className={INFO}>
        <Clock size={13} /> This match has closed
      </span>
    );
  return (
    <>
      <button type="button" onClick={() => perform(item, "matchAccept")} className={ACCEPT}>
        <Swords size={15} /> Accept &amp; join
      </button>
      <button type="button" onClick={() => perform(item, "matchDecline")} className={OUTLINE}>
        <X size={15} /> Decline
      </button>
    </>
  );
}

function InviteCard({ item, perform }: { item: InviteItem; perform: (i: InviteItem, r: Run) => void }) {
  const s = KIND_STYLE[item.kind];
  return (
    <div className="flex flex-col rounded-3xl border p-4" style={{ background: s.tint, borderColor: s.ring }}>
      <span className="kicker" style={{ color: s.accent }}>
        {kickerLabel(item.kind, item.dir)}
      </span>

      <Link href={item.href} className="mt-2.5 flex items-center gap-3">
        {item.emoji ? (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface text-xl" style={{ boxShadow: `inset 0 0 0 1px ${s.ring}` }}>
            {item.emoji}
          </span>
        ) : (
          <Avatar url={item.avatarUrl} hue={item.hue} name={item.title} size={48} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-ink">{item.title}</span>
            {item.verified ? <BadgeCheck size={14} className="shrink-0 text-brand" aria-label="Verified" /> : null}
          </div>
          {item.sub ? <span className="mt-0.5 block truncate text-xs text-mute">{item.sub}</span> : null}
        </div>
      </Link>

      {item.kind === "teams" && item.dir === "received" ? <p className="mt-2.5 text-[11px] leading-snug text-faint">Joining shares your name and profile with the team&rsquo;s members.</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <InviteActions item={item} perform={perform} />
      </div>
    </div>
  );
}
