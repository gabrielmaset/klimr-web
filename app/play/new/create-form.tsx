"use client";

import { useActionState, useState } from "react";
import { createMatch } from "./actions";
import { SPORTS } from "@/lib/sports";

export function CreateMatchForm() {
  const [state, action, pending] = useActionState(createMatch, undefined);
  const [sport, setSport] = useState<string>("");
  const [format, setFormat] = useState<"singles" | "doubles">("singles");

  const defaultSlots = format === "doubles" ? 4 : 2;

  return (
    <form action={action} className="mt-8 space-y-7">
      {/* sport */}
      <div>
        <label className="kicker text-faint">Sport</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {SPORTS.map((s) => {
            const on = sport === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSport(s.key)}
                aria-pressed={on}
                className="press flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors"
                style={{
                  borderColor: on ? "#ff4e1b" : "#e4e4e7",
                  background: on ? "#fff1ed" : "transparent",
                  color: on ? "#d63a0f" : "#71717a",
                }}
              >
                <span aria-hidden>{s.emoji}</span> {s.name}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="sport" value={sport} />
      </div>

      {/* format */}
      <div>
        <label className="kicker text-faint">Format</label>
        <div className="mt-2 inline-flex rounded-full border border-rule p-1">
          {(["singles", "doubles"] as const).map((f) => {
            const on = format === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className="press rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
                style={{ background: on ? "#0a0a0b" : "transparent", color: on ? "#fff" : "#71717a" }}
              >
                {f === "singles" ? "Singles" : "Doubles"}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="format" value={format} />
      </div>

      {/* when + slots */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="scheduled_at" className="kicker text-faint">When <span className="font-sans normal-case tracking-normal text-faint">(optional)</span></label>
          <input
            id="scheduled_at"
            name="scheduled_at"
            type="datetime-local"
            className="mt-2 w-full rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand"
          />
          <p className="mt-1.5 text-xs text-faint">Leave blank for open / anytime play.</p>
        </div>
        <div>
          <label htmlFor="slots" className="kicker text-faint">Players needed</label>
          <input
            id="slots"
            name="slots"
            type="number"
            min={2}
            max={8}
            defaultValue={defaultSlots}
            key={defaultSlots}
            className="mt-2 w-full rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand"
          />
          <p className="mt-1.5 text-xs text-faint">Including you. {format === "doubles" ? "Doubles is usually 4." : "Singles is 2."}</p>
        </div>
      </div>

      {/* location */}
      <div>
        <label htmlFor="location" className="kicker text-faint">Court / location <span className="font-sans normal-case tracking-normal text-faint">(optional)</span></label>
        <input
          id="location"
          name="location"
          type="text"
          placeholder="Mar Vista Rec Center, court 3"
          maxLength={120}
          className="mt-2 w-full rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand"
        />
      </div>

      {/* recurring */}
      <label className="flex items-center gap-3">
        <input name="recurring" type="checkbox" className="h-4 w-4 accent-brand" />
        <span className="text-sm text-ink">This is a recurring game</span>
      </label>

      {state?.error ? (
        <p className="rounded-xl border border-brand/30 bg-tint-brand px-4 py-3 text-sm text-brand-deep">{state.error}</p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !sport}
          className="press rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create match"}
        </button>
        <span className="text-xs text-faint">You&rsquo;ll be seated automatically as the organizer.</span>
      </div>
    </form>
  );
}
