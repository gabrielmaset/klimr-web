"use client";

import { Trophy } from "lucide-react";

function nextPow2(n: number) {
  let p = 2;
  while (p < n) p *= 2;
  return Math.max(2, p);
}

function roundName(roundIdx: number, totalRounds: number) {
  const fromEnd = totalRounds - roundIdx;
  if (fromEnd === 1) return "Final";
  if (fromEnd === 2) return "Semifinals";
  if (fromEnd === 3) return "Quarterfinals";
  if (fromEnd === 4) return "Round of 16";
  if (fromEnd === 5) return "Round of 32";
  if (fromEnd === 6) return "Round of 64";
  return `Round ${roundIdx + 1}`;
}

// Standard single-elimination seeding order (1 v N, 2 v N-1, …) for a power-of-two size.
function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    const next: number[] = [];
    for (const s of order) {
      next.push(s);
      next.push(sum - s);
    }
    order = next;
  }
  return order;
}

function SeedSlot({ seed, label }: { seed: number; label: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-tint-brand text-[10px] font-bold text-brand-deep ring-1 ring-inset ring-brand/20">
        {seed}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] italic text-faint">{label}</span>
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2">
      <span className="h-5 w-5 shrink-0 rounded-md border border-dashed border-rule" />
      <span className="min-w-0 flex-1 truncate text-[13px] italic text-faint">Awaiting winner</span>
    </div>
  );
}

export function BracketTemplate({
  entrants,
  seedLabel,
  caption,
}: {
  entrants: number;
  seedLabel?: (seed: number) => string;
  caption: string;
}) {
  const size = nextPow2(Math.max(2, Math.floor(entrants) || 2));
  const order = seedOrder(size);
  const totalRounds = Math.round(Math.log2(size));

  const firstRound: [number, number][] = [];
  for (let i = 0; i < size / 2; i++) firstRound.push([order[2 * i], order[2 * i + 1]]);

  const columns: { label: string; matches: ([number, number] | null)[] }[] = [{ label: roundName(0, totalRounds), matches: firstRound }];
  let count = size / 2;
  for (let r = 1; r < totalRounds; r++) {
    count = Math.floor(count / 2);
    columns.push({ label: roundName(r, totalRounds), matches: Array.from({ length: count }, () => null) });
  }

  const lbl = (seed: number) => (seedLabel ? seedLabel(seed) : `Seed ${seed}`);

  return (
    <div>
      <p className="mb-3 flex items-center gap-2 rounded-xl border border-dashed border-brand/30 bg-tint-brand/40 px-3 py-2 text-xs font-medium text-brand-deep">
        <Trophy size={14} className="shrink-0" /> {caption}
      </p>
      <div className="overflow-x-auto pb-2">
        <div className="bkt min-w-max">
          {columns.map((col, ci) => (
            <div key={ci} className="bkt-col">
              <p className="bkt-col-label">{col.label}</p>
              {col.matches.map((m, mi) => (
                <div key={mi} className="bkt-cell">
                  <div className="bkt-card rounded-xl border border-rule bg-surface/80 shadow-[0_1px_2px_rgba(10,10,11,0.04)]">
                    {ci === 0 && m ? (
                      <>
                        <SeedSlot seed={m[0]} label={lbl(m[0])} />
                        <div className="h-px bg-rule" />
                        <SeedSlot seed={m[1]} label={lbl(m[1])} />
                      </>
                    ) : (
                      <>
                        <EmptySlot />
                        <div className="h-px bg-rule" />
                        <EmptySlot />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {/* champion */}
          <div className="bkt-col">
            <p className="bkt-col-label">Champion</p>
            <div className="bkt-cell">
              <div className="bkt-card rounded-xl border border-brand/40 bg-gradient-to-br from-brand to-brand-deep px-3 py-3 text-white shadow-sm">
                <div className="flex items-center gap-2">
                  <Trophy size={16} className="shrink-0" />
                  <span className="text-sm font-bold tracking-tight">Champion</span>
                </div>
                <p className="mt-0.5 text-[11px] text-white/80">Crowned when the final is played</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
