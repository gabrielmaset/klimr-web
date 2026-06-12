import Link from "next/link";
import { BadgeCheck, CheckCheck, Fingerprint, ShieldX } from "lucide-react";

/* ------------------------------------------------------------------ */
/* The living ladder — the product, rendered as the hero's signature. */
/* Names and points mirror the investor demo's Mar Vista pickleball   */
/* board so every Klimr artifact tells one coherent story.            */
/* ------------------------------------------------------------------ */

const ZOOMS = ["ZIP", "NBHD", "CITY", "STATE", "NATL", "WORLD"] as const;

const LADDER = [
  { rank: 1, name: "Sofia Reyes", points: "2,810", hue: 200 },
  { rank: 2, name: "Marcus Chen", points: "2,540", hue: 18 },
  { rank: 3, name: "Iris Okafor", points: "2,460", hue: 280 },
];

function HueAvatar({ hue, name, size = 34 }: { hue: number; name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
  return (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-display text-surface"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(145deg, hsl(${hue},85%,62%) 0%, hsl(${(hue + 22) % 360},80%,48%) 100%)`,
      }}
    >
      {initials}
    </div>
  );
}

function LadderCard() {
  return (
    <div className="rise rounded-3xl border border-rule bg-surface p-5 shadow-[0_32px_64px_-40px_rgba(10,10,11,0.35)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden>🏓</span>
          <span className="text-sm font-bold text-ink">Pickleball</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
          <span className="kicker text-mute">Mar Vista · live</span>
        </div>
      </div>

      <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1" aria-label="Ranking zoom levels">
        {ZOOMS.map((z, i) => (
          <span
            key={z}
            className={
              "kicker shrink-0 rounded-full border px-2.5 py-1.5 " +
              (i === 0
                ? "border-ink bg-ink text-pop"
                : "border-rule bg-surface text-mute")
            }
          >
            {z}
          </span>
        ))}
      </div>

      <ol className="mt-4 space-y-2">
        {LADDER.map((p, i) => (
          <li
            key={p.rank}
            className="rise flex items-center gap-3 rounded-2xl border border-rule bg-bg px-3.5 py-2.5"
            style={{ animationDelay: `${160 + i * 110}ms` }}
          >
            <span className="w-6 font-mono text-sm font-bold text-mute tabular">
              {p.rank}
            </span>
            <HueAvatar hue={p.hue} name={p.name} />
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-ink">{p.name}</span>
              <BadgeCheck size={14} className="shrink-0 text-success" aria-label="Verified" />
            </span>
            <span className="font-mono text-sm font-bold text-ink tabular">{p.points}</span>
          </li>
        ))}
        <li
          className="rise flex items-center gap-3 rounded-2xl border border-brand bg-tint-brand px-3.5 py-2.5"
          style={{ animationDelay: "490ms" }}
        >
          <span className="w-6 font-mono text-sm font-bold text-brand-deep tabular">4</span>
          <HueAvatar hue={178} name="Alex Rivera" />
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate text-sm font-bold text-ink">You</span>
            <BadgeCheck size={14} className="shrink-0 text-success" aria-label="Verified" />
          </span>
          <span className="flex items-center gap-2">
            <span className="kicker text-brand-deep">▲ 2 this week</span>
            <span className="font-mono text-sm font-bold text-ink tabular">2,280</span>
          </span>
        </li>
      </ol>

      <p className="mt-4 flex items-center gap-1.5 text-[11px] text-mute">
        <BadgeCheck size={12} className="text-success" aria-hidden />
        Only verified matches count toward rankings.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const MARQUEE = [
  "Tennis 🎾",
  "Pickleball 🏓",
  "Padel",
  "Racquetball",
  "Mar Vista",
  "ZIP 90066",
  "Verified players",
  "Real results",
];

const FLOWS: { title: string; body: string; status: "live" | "build" | "soon" }[] = [
  { title: "Accounts & profile", body: "Magic-link sign-in, home ZIP, primary sport. No passwords.", status: "live" },
  { title: "Identity verification", body: "Every player verified — the trust floor. Stubbed today, KYC provider next.", status: "live" },
  { title: "Rankings + geo zoom", body: "Per sport, ZIP → neighborhood → city → world. The engine is live; the screen is next.", status: "build" },
  { title: "Match · confirm · void", body: "Two-sided confirmation. A disputed match counts for no one.", status: "soon" },
  { title: "Open play + waitlist", body: "Join nearby matches. Waitlists auto-promote.", status: "soon" },
  { title: "Block & report", body: "Safety filters across rankings and discovery.", status: "soon" },
];

const STATUS = {
  live: { label: "Live", dot: "bg-success", pulse: true, text: "text-success" },
  build: { label: "In build", dot: "bg-brand", pulse: true, text: "text-brand-deep" },
  soon: { label: "Coming", dot: "bg-faint", pulse: false, text: "text-faint" },
} as const;

const TRUST = [
  {
    icon: Fingerprint,
    title: "Every player is a real person",
    body: "Government ID + selfie, once. We verify, then delete the documents — you become a badge, not a stored file.",
  },
  {
    icon: CheckCheck,
    title: "Both sides confirm every result",
    body: "A score only counts when both players sign it. No phantom wins, no padded ladders.",
  },
  {
    icon: ShieldX,
    title: "Disputes void the match",
    body: "If players disagree, the match counts for no one. Arguing your way up the board is impossible.",
  },
];

export default function Home() {
  return (
    <>
      {/* ---------------- Hero ---------------- */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 lg:grid-cols-12 lg:pt-20">
        <div className="lg:col-span-7">
          <div className="rise flex items-center gap-2">
            <span className="live-dot h-2 w-2 rounded-full bg-brand" aria-hidden />
            <p className="kicker text-ink">Los Angeles · four sports · pre-launch</p>
          </div>
          <h1
            className="rise mt-5 font-display text-[clamp(2.9rem,8vw,5.6rem)] leading-[0.93] tracking-tight text-ink"
            style={{ animationDelay: "90ms" }}
          >
            Your game,
            <br />
            <span className="skew-mark">ranked.</span>
          </h1>
          <p
            className="rise mt-6 max-w-lg text-lg leading-relaxed text-ink-soft"
            style={{ animationDelay: "180ms" }}
          >
            Klimr is the social network for sports players. Match with verified
            people nearby, log real results, and watch where you stand — from
            your ZIP code to the world.
          </p>
          <div className="rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "270ms" }}>
            <Link
              href="/signup"
              className="press rounded-full bg-brand px-6 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep"
            >
              Claim your spot
            </Link>
            <Link
              href="/investors"
              className="press rounded-full border border-ink px-6 py-3.5 text-[15px] font-semibold text-ink transition-colors hover:bg-ink hover:text-surface"
            >
              For investors
            </Link>
          </div>
          <p className="rise mt-6 font-mono text-[12px] text-mute" style={{ animationDelay: "360ms" }}>
            Invite-only beta · every player identity-verified
          </p>
        </div>
        <div className="lg:col-span-5">
          <LadderCard />
        </div>
      </section>

      {/* ---------------- Marquee ---------------- */}
      <div className="overflow-hidden border-y border-rule bg-surface py-3" aria-hidden>
        <div className="marquee flex w-max gap-10">
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 gap-10">
              {MARQUEE.map((m) => (
                <span key={m + copy} className="kicker whitespace-nowrap text-faint">
                  {m}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ---------------- Build status ---------------- */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="kicker text-brand-deep">Built in the open</p>
        <h2 className="mt-3 max-w-2xl font-display text-4xl leading-[0.98] text-ink sm:text-5xl">
          Six flows. Shipping <span className="italic">one by one.</span>
        </h2>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-mute">
          This is the live product, growing in public. What you see below is
          exactly where the build stands today.
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FLOWS.map((f) => {
            const s = STATUS[f.status];
            return (
              <div key={f.title} className="lift rounded-3xl border border-rule bg-surface p-6">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${s.dot} ${s.pulse ? "live-dot" : ""}`}
                    aria-hidden
                  />
                  <span className={`kicker ${s.text}`}>{s.label}</span>
                </div>
                <h3 className="mt-3 font-display text-[22px] text-ink">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-mute">{f.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------------- Trust floor (dark) ---------------- */}
      <section className="relative overflow-hidden bg-ink py-20 text-surface">
        {/* Court-line geometry — the one quiet texture, used once. */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
          aria-hidden
          preserveAspectRatio="none"
          viewBox="0 0 1200 600"
        >
          <rect x="60" y="40" width="1080" height="520" fill="none" stroke="white" strokeWidth="2" />
          <line x1="600" y1="40" x2="600" y2="560" stroke="white" strokeWidth="2" />
          <rect x="240" y="150" width="720" height="300" fill="none" stroke="white" strokeWidth="2" />
          <line x1="240" y1="300" x2="960" y2="300" stroke="white" strokeWidth="2" />
        </svg>
        <div className="relative mx-auto max-w-6xl px-5">
          <p className="kicker text-brand">The trust floor</p>
          <h2 className="mt-3 max-w-2xl font-display text-4xl leading-[0.98] sm:text-5xl">
            Rankings you can <span className="italic text-brand">actually believe.</span>
          </h2>
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {TRUST.map((t) => (
              <div key={t.title} className="rounded-3xl bg-ink-soft p-6">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15">
                  <t.icon size={19} className="text-brand" aria-hidden />
                </div>
                <h3 className="mt-4 font-display text-[21px]">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-faint">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="rounded-[2rem] bg-brand px-7 py-14 text-center text-white sm:px-12">
          <h2 className="font-display text-4xl leading-[0.95] sm:text-6xl">
            Climb the <span className="italic">block.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-white/90">
            Mar Vista is first. Got an invite? Your spot on the board is
            waiting when rankings go live.
          </p>
          <Link
            href="/signup"
            className="press mt-7 inline-block rounded-full bg-ink px-7 py-3.5 text-[15px] font-bold text-surface transition-transform hover:scale-[1.02]"
          >
            Claim your spot
          </Link>
        </div>
      </section>
    </>
  );
}
