"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { cleanQueueCode, splitQueueCode } from "@/lib/queue";

/** Live Queue inside the app shell: one code field (6-char session or 7-char
 *  court codes both welcome) and the door to standalone queues. */
export function QueueHub() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const ready = code.length >= 6;
  const join = () => {
    if (ready) router.push(`/q/${splitQueueCode(code).code}`);
  };

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <p className="kicker text-brand-deep">Live Queue</p>
      <h1 className="mt-1 font-display text-3xl font-bold text-ink">Get on a court</h1>
      <p className="mt-2 max-w-[52ch] text-sm text-mute">
        Type the code from the courtside screen, a poster, or the organizer — session codes are six characters, and court codes (like <span className="font-mono font-semibold">ABC1234</span>) work too.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-rule bg-surface p-6 shadow-e1">
          <p className="text-sm font-semibold text-ink">Join with a code</p>
          <div className="mt-3 flex items-center gap-2.5">
            <input
              value={code}
              onChange={(e) => setCode(cleanQueueCode(e.target.value))}
              onKeyDown={(e) => { if (e.key === "Enter") join(); }}
              placeholder="ABC123"
              aria-label="Queue or court code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-2xl border border-rule bg-white px-4 py-3.5 text-center font-mono text-2xl font-bold tracking-[0.3em] text-ink outline-none focus:border-brand"
            />
            <button
              type="button"
              disabled={!ready}
              onClick={join}
              className="press grid h-[3.4rem] w-[3.4rem] shrink-0 place-items-center rounded-2xl bg-brand text-white transition hover:bg-brand-deep disabled:opacity-40"
              aria-label="Open queue"
            >
              <ArrowRight size={20} />
            </button>
          </div>
          <p className="mt-2.5 text-xs text-faint">Guests can join too — the walk-up page never needs an account.</p>
        </div>

        <div className="flex flex-col justify-between rounded-3xl border border-rule bg-surface p-6 shadow-e1">
          <div>
            <p className="text-sm font-semibold text-ink">Start your own</p>
            <p className="mt-1 text-sm text-mute">
              No event needed — pick the sport, name your courts, choose how teams are named, and share the code. It turns itself off after the day ends.
            </p>
          </div>
          <Link href="/queue/new" className="press mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white transition hover:bg-ink-soft">
            <Plus size={15} /> Create a live queue
          </Link>
        </div>
      </div>
    </div>
  );
}
