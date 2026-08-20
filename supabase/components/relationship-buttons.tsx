"use client";

import { useState, useTransition } from "react";
import { UserPlus, UserCheck, Check, X, Clock, Rss, Loader2 } from "lucide-react";
import { requestConnection, acceptConnection, removeConnection, follow, unfollow } from "@/app/network/actions";
import type { FriendStatus } from "@/lib/social";

export type { FriendStatus };

// Relationship controls with optimistic state: the label flips instantly, the
// server action runs in a transition, and on failure the state rolls back and
// the reason shows inline (cooldowns, rate limits, unavailable).

const base = "press inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60";
const solid = `${base} bg-ink text-surface hover:bg-ink-soft`;
const outline = `${base} border border-rule text-ink hover:bg-bg`;

export function RelationshipButtons({
  targetId,
  friendStatus,
  isFollowing,
}: {
  targetId: string;
  friendStatus: FriendStatus;
  isFollowing: boolean;
}) {
  const [status, setStatus] = useState<FriendStatus>(friendStatus);
  const [following, setFollowing] = useState(isFollowing);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function connect() {
    const prev = status;
    setStatus("requested");
    setNote(null);
    startTransition(async () => {
      const r = await requestConnection(targetId);
      if (!r.ok) {
        setStatus(prev);
        setNote(r.message);
      } else if (r.state === "friends") {
        setStatus("friends");
      }
    });
  }

  function accept() {
    const prev = status;
    setStatus("friends");
    setNote(null);
    startTransition(async () => {
      const r = await acceptConnection(targetId);
      if (!r.ok) {
        setStatus(prev);
        setNote(r.message);
      }
    });
  }

  function remove(asDecline: boolean, rollback: FriendStatus) {
    setStatus("none");
    setNote(null);
    startTransition(async () => {
      const r = await removeConnection(targetId, asDecline);
      if (!r.ok) {
        setStatus(rollback);
        setNote(r.message);
      }
    });
  }

  function toggleFollow() {
    const prev = following;
    setFollowing(!prev);
    setNote(null);
    startTransition(async () => {
      const r = prev ? await unfollow(targetId) : await follow(targetId);
      if (!r.ok) {
        setFollowing(prev);
        setNote(r.message);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {status === "none" ? (
          <button type="button" onClick={connect} disabled={pending} className={solid}>
            {pending ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Connect
          </button>
        ) : null}

        {status === "requested" ? (
          <button type="button" onClick={() => remove(false, "requested")} disabled={pending} className={outline} title="Cancel request">
            <Clock size={15} /> Requested
          </button>
        ) : null}

        {status === "incoming" ? (
          <>
            <button type="button" onClick={accept} disabled={pending} className={solid}>
              <Check size={15} /> Accept
            </button>
            <button type="button" onClick={() => remove(true, "incoming")} disabled={pending} className={outline}>
              <X size={15} /> Decline
            </button>
          </>
        ) : null}

        {status === "friends" ? (
          <button
            type="button"
            onClick={() => {
              if (confirm("Remove this connection?")) remove(false, "friends");
            }}
            disabled={pending}
            className={`${outline} text-success`}
            title="Remove connection"
          >
            <UserCheck size={15} /> Connected
          </button>
        ) : null}

        <button type="button" onClick={toggleFollow} disabled={pending} className={outline}>
          {following ? <UserCheck size={15} /> : <Rss size={15} />} {following ? "Following" : "Follow"}
        </button>
      </div>
      {note ? <p className="mt-2 text-xs font-medium text-brand-deep">{note}</p> : null}
    </div>
  );
}
