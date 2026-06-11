import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BadgeCheck, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { startVerification, approveVerification } from "./actions";
import { signOutAction } from "@/app/auth/actions";

export const metadata: Metadata = { title: "Your account" };

const SPORT_EMOJI: Record<string, string> = {
  tennis: "🎾",
  pickleball: "🏓",
  padel: "🟡",
  racquetball: "🟦",
  golf: "⛳",
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "display_name, home_zip, neighborhood, city, state, primary_sport, verification_status, avatar_hue",
    )
    .eq("id", user.id)
    .single();

  if (!profile || !profile.primary_sport || !profile.home_zip) {
    redirect("/onboarding");
  }

  const v = profile.verification_status;
  const hue = profile.avatar_hue ?? 18;
  const name = profile.display_name || user.email || "Player";
  const initials = name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const home =
    [profile.neighborhood, profile.city, profile.state].filter(Boolean).join(", ") ||
    `ZIP ${profile.home_zip}`;
  const sportName = profile.primary_sport
    ? profile.primary_sport.charAt(0).toUpperCase() + profile.primary_sport.slice(1)
    : "—";

  return (
    <div className="mx-auto max-w-lg space-y-5 px-5 py-14">
      {sp.note === "area" ? (
        <div className="rise rounded-2xl border border-pop bg-pop/25 px-4 py-3 text-sm leading-snug text-ink">
          Saved! We have not mapped your area&apos;s neighborhoods yet — your
          ZIP-level ranking works from day one, and the rest fills in as Klimr
          expands.
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl text-ink">Your account</h1>
        <form action={signOutAction}>
          <button className="press text-sm font-semibold text-mute transition-colors hover:text-ink">
            Sign out
          </button>
        </form>
      </div>

      {/* Profile card */}
      <div className="rise rounded-3xl border border-rule bg-surface p-5">
        <div className="flex items-center gap-4">
          <div
            aria-hidden
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full font-display text-2xl text-surface"
            style={{
              background: `linear-gradient(145deg, hsl(${hue},85%,62%) 0%, hsl(${(hue + 22) % 360},80%,48%) 100%)`,
            }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="truncate text-lg font-bold text-ink">{name}</div>
            <div className="truncate font-mono text-[12px] text-mute">{user.email}</div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-rule bg-bg px-3 py-1.5 text-sm font-semibold text-ink">
            <span aria-hidden>{SPORT_EMOJI[profile.primary_sport ?? ""] ?? "•"}</span>
            {sportName}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-rule bg-bg px-3 py-1.5 text-sm text-ink-soft">
            <MapPin size={13} className="text-brand" aria-hidden />
            {home}
            <span className="font-mono text-[11px] text-mute">{profile.home_zip}</span>
          </span>
        </div>
      </div>

      {/* Verification card */}
      <div className="rise rounded-3xl border border-rule bg-surface p-5" style={{ animationDelay: "90ms" }}>
        <div className="kicker text-faint">Identity verification</div>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          Every Klimr player is verified — it&apos;s the trust floor for
          rankings and matches.
        </p>
        <div className="mt-4">
          {v === "verified" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-tint-success px-3 py-1.5 text-sm font-bold text-success">
              <BadgeCheck size={15} aria-hidden /> Verified
            </span>
          ) : v === "pending" ? (
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-full bg-pop px-3 py-1.5 text-sm font-bold text-ink">
                Under review
              </span>
              <form action={approveVerification}>
                <button className="block text-xs font-semibold text-faint underline underline-offset-2 transition-colors hover:text-mute">
                  Demo only: approve (admin)
                </button>
              </form>
            </div>
          ) : (
            <form action={startVerification}>
              <button className="press rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep">
                Start verification
              </button>
            </form>
          )}
        </div>
      </div>

      {/* What's next — a ghost of the ladder to come */}
      <div className="rise rounded-3xl border border-dashed border-rule bg-bg p-5" style={{ animationDelay: "180ms" }}>
        <div className="flex items-center gap-1.5">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
          <span className="kicker text-brand-deep">Next up · rankings</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          Your {sportName} board for {profile.neighborhood ?? `ZIP ${profile.home_zip}`} is
          being built right now. Your spot is reserved.
        </p>
        <div className="mt-4 space-y-1.5 opacity-50" aria-hidden>
          {[1, 2, 3].map((r) => (
            <div key={r} className="flex items-center gap-3 rounded-xl border border-rule bg-surface px-3 py-2">
              <span className="w-5 font-mono text-xs font-bold text-faint">{r}</span>
              <span className="h-6 w-6 rounded-full bg-rule" />
              <span className="h-2.5 flex-1 rounded bg-rule" />
              <span className="h-2.5 w-10 rounded bg-rule" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
