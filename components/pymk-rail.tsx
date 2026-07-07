"use client";

import { useState, useTransition } from "react";
import { UserPlus, Check, X, Sparkles } from "lucide-react";
import { PlayerCard } from "@/components/player-card";
import { requestConnection } from "@/app/network/actions";
import { pymkReason, type PymkRow } from "@/lib/social";

// "People you may know" — recommendations from the sports-aware graph RPC
// (mutuals, shared teams, played-together, shared sports/skill, same area).
// Connect is optimistic with rollback; ✕ dismisses for this visit.

export function PymkRail({ people, avatarUrlFor }: { people: PymkRow[]; avatarUrlFor: Record<string, string | null> }) {
  const [rows, setRows] = useState(people);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (rows.length === 0) return null;

  function connect(id: string) {
    setNote(null);
    setRequested((s) => new Set(s).add(id));
    startTransition(async () => {
      const r = await requestConnection(id);
      if (!r.ok) {
        setRequested((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
        setNote(r.message);
      }
    });
  }

  function dismiss(id: string) {
    setRows((xs) => xs.filter((x) => x.user_id !== id));
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={15} className="text-pop" />
        <h2 className="text-base font-extrabold text-ink">People you may know</h2>
      </div>
      {note ? <p className="mb-2 text-xs font-medium text-brand-deep">{note}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.slice(0, 8).map((p) => {
          const sent = requested.has(p.user_id);
          return (
            <div key={p.user_id} className="relative">
              <button
                type="button"
                onClick={() => dismiss(p.user_id)}
                aria-label="Dismiss suggestion"
                className="press absolute right-2 top-2 z-20 grid h-7 w-7 place-items-center rounded-full bg-surface/80 text-faint backdrop-blur hover:bg-bg hover:text-ink"
              >
                <X size={14} />
              </button>
              <PlayerCard
                name={p.display_name}
                href={`/profile/${p.user_id}`}
                avatarUrl={avatarUrlFor[p.user_id] ?? null}
                verified={p.verification_status === "verified"}
                primarySport={p.primary_sport ?? undefined}
                location={p.neighborhood ?? p.city ?? null}
                contextChip={pymkReason(p)}
                footerAction={
                  <button
                    type="button"
                    disabled={sent}
                    onClick={() => connect(p.user_id)}
                    className={`press inline-flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      sent ? "bg-tint-success text-success" : "bg-ink text-surface hover:bg-ink-soft"
                    }`}
                  >
                    {sent ? (
                      <>
                        <Check size={13} /> Requested
                      </>
                    ) : (
                      <>
                        <UserPlus size={13} /> Connect
                      </>
                    )}
                  </button>
                }
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
