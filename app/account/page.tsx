import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, CalendarClock, MapPin, Pencil, ShieldCheck, Star, Swords } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { startVerification, approveVerification } from "./actions";
import { signOutAction } from "@/app/auth/actions";
import { AvatarUploader } from "@/components/avatar-uploader";

export const metadata: Metadata = { title: "Your account" };

const SPORT_EMOJI: Record<string, string> = {
  tennis: "🎾",
  pickleball: "🏓",
  padel: "🟡",
  racquetball: "🟦",
};

const LEVEL_LABEL: Record<string, string> = {
  new: "New",
  casual: "Casual",
  competitive: "Competitive",
  advanced: "Advanced",
};

const FORMAT_LABEL: Record<string, string> = {
  singles: "Singles",
  doubles: "Doubles",
  both: "Singles & doubles",
};

const STYLE_LABEL: Record<string, string> = {
  social: "Mostly social",
  competitive: "Mostly competitive",
  both: "Social & competitive",
};

const HAND_LABEL: Record<string, string> = {
  right: "Right-handed",
  left: "Left-handed",
  either: "Either hand",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string; welcome?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: mySports }, { data: sportMeta }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "display_name, home_zip, neighborhood, city, state, primary_sport, verification_status, avatar_hue, avatar_path, bio, availability, preferred_format, play_style, handedness",
        )
        .eq("id", user.id)
        .single(),
      supabase
        .from("player_sports")
        .select("sport_key, skill_level, skill_rating, preferred_format, handedness")
        .eq("user_id", user.id),
      supabase.from("sports").select("key, skill_system"),
    ]);

  if (!profile || !profile.primary_sport || !profile.home_zip) {
    redirect("/onboarding");
  }

  const v = profile.verification_status;
  const hue = profile.avatar_hue ?? 18;
  const name = profile.display_name || user.email || "Player";
  const firstName = name.split(" ")[0];
  const photoUrl = profile.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl
    : null;
  const home =
    [profile.neighborhood, profile.city, profile.state].filter(Boolean).join(", ") ||
    `ZIP ${profile.home_zip}`;
  const slots = Array.isArray(profile.availability) ? profile.availability.length : 0;
  const systems = new Map((sportMeta ?? []).map((s) => [s.key, s.skill_system]));
  const sportsList = (mySports ?? []).sort((a, b) =>
    a.sport_key === profile.primary_sport ? -1 : b.sport_key === profile.primary_sport ? 1 : 0,
  );
  const hasRating = sportsList.some((s) => s.skill_rating != null);

  /* profile completeness — finishing the wizard earns the base */
  const pct =
    40 +
    (slots > 0 ? 15 : 0) +
    (profile.bio ? 15 : 0) +
    (hasRating ? 15 : 0) +
    (v === "verified" ? 15 : 0);
  const nextHint =
    v !== "verified"
      ? "verify your identity to finish"
      : !hasRating
        ? "add a rating to finish"
        : !profile.bio
          ? "add a bio to finish"
          : slots === 0
            ? "set your schedule to finish"
            : null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 lg:py-16">
      {sp.welcome === "1" ? (
        <div className="rise mb-5 rounded-2xl border border-brand bg-tint-brand px-4 py-3.5 text-sm leading-relaxed text-ink">
          <span className="font-bold">Welcome to the board, {firstName}.</span>{" "}
          Your profile is in. One step left before your matches count —
          verify your identity below.
          {sp.note === "area" ? (
            <> (We have not mapped your area&apos;s neighborhoods yet; your
            ZIP-level ranking works from day one.)</>
          ) : null}
        </div>
      ) : sp.note === "area" ? (
        <div className="rise mb-5 rounded-2xl border border-pop bg-pop/25 px-4 py-3 text-sm leading-snug text-ink">
          Saved! We have not mapped your area&apos;s neighborhoods yet — your
          ZIP-level ranking works from day one, and the rest fills in as Klimr
          expands.
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Your account</h1>
        <form action={signOutAction}>
          <button className="press text-sm font-semibold text-mute transition-colors hover:text-ink">
            Sign out
          </button>
        </form>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {/* ---------------- LEFT · profile ---------------- */}
        <div className="rise rounded-3xl border border-rule bg-surface p-6">
          <div className="flex items-start justify-between gap-3">
            <AvatarUploader initialPhotoUrl={photoUrl} hue={hue} name={name} />
            <Link
              href="/onboarding"
              className="press flex shrink-0 items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink"
            >
              <Pencil size={12} aria-hidden /> Edit profile
            </Link>
          </div>

          <div className="mt-5">
            <div className="text-xl font-bold text-ink">{name}</div>
            <div className="font-mono text-[12px] text-mute">{user.email}</div>
            {profile.bio ? (
              <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-soft">{profile.bio}</p>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {sportsList.map((s) => (
              <span
                key={s.sport_key}
                className="flex items-center gap-1.5 rounded-full border border-rule bg-bg px-3 py-1.5 text-sm font-semibold text-ink"
              >
                <span aria-hidden>{SPORT_EMOJI[s.sport_key] ?? "•"}</span>
                {cap(s.sport_key)}
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-mute">
                  {LEVEL_LABEL[s.skill_level ?? "casual"]}
                </span>
                {s.skill_rating != null ? (
                  <span className="font-mono text-[10px] font-bold text-brand-deep">
                    {systems.get(s.sport_key) ?? "Rating"} {s.skill_rating}
                  </span>
                ) : null}
                {s.sport_key === profile.primary_sport ? (
                  <Star size={11} className="text-brand-deep" fill="currentColor" aria-label="Primary sport" />
                ) : null}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-rule bg-bg px-3 py-1.5 text-sm text-ink-soft">
              <MapPin size={13} className="text-brand" aria-hidden />
              {home}
              <span className="font-mono text-[11px] text-mute">{profile.home_zip}</span>
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-rule bg-bg px-3 py-1.5 text-sm text-ink-soft">
              <CalendarClock size={13} className="text-brand" aria-hidden />
              {slots > 0 ? `Free ${slots} ${slots === 1 ? "block" : "blocks"} a week` : "Schedule not set"}
            </span>
          </div>
          <div className="mt-3">
            <div className="kicker text-faint">How you play</div>
            <div className="mt-2 space-y-1.5">
              {sportsList.map((s) => (
                <div key={s.sport_key} className="flex flex-wrap items-center gap-x-2 text-sm text-ink-soft">
                  <span className="inline-flex items-center gap-1 font-semibold text-ink">
                    <span aria-hidden>{SPORT_EMOJI[s.sport_key] ?? "•"}</span>
                    {cap(s.sport_key)}
                  </span>
                  <span className="text-faint" aria-hidden>·</span>
                  <span>{FORMAT_LABEL[s.preferred_format ?? "both"]}</span>
                  {s.handedness ? (
                    <>
                      <span className="text-faint" aria-hidden>·</span>
                      <span>{HAND_LABEL[s.handedness]}</span>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full border border-rule bg-bg px-3 py-1.5 text-sm text-ink-soft">
                <Swords size={13} className="text-brand" aria-hidden />
                {STYLE_LABEL[profile.play_style ?? "both"]}
              </span>
            </div>
          </div>

          {/* completeness */}
          <div className="mt-6 border-t border-rule pt-5">
            <div className="flex items-baseline justify-between">
              <span className="kicker text-faint">Profile {pct}% complete</span>
              {nextHint ? <span className="text-[11px] text-mute">{nextHint}</span> : null}
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-rule">
              <div
                className={"h-full rounded-full transition-all " + (pct === 100 ? "bg-success" : "bg-brand")}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* ---------------- RIGHT · sidebar ---------------- */}
        <div className="space-y-5">
          {/* Security card */}
          <div className="rise rounded-3xl border border-rule bg-surface p-6">
            <div className="kicker text-faint">Security</div>
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tint-success">
                <ShieldCheck size={19} className="text-success" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-ink">Two-factor on</div>
                <div className="text-[12px] text-mute">Required at every sign-in</div>
              </div>
            </div>
            <Link
              href="/account/security"
              className="press mt-4 inline-block text-sm font-semibold text-ink underline underline-offset-2 transition-colors hover:text-brand-deep"
            >
              Manage security
            </Link>
          </div>

          {/* Verification card */}
          <div className="rise rounded-3xl border border-rule bg-surface p-6" style={{ animationDelay: "90ms" }}>
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
          <div className="rise rounded-3xl border border-dashed border-rule bg-bg p-6" style={{ animationDelay: "180ms" }}>
            <div className="flex items-center gap-1.5">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
              <span className="kicker text-brand-deep">Next up · rankings</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-mute">
              Your {cap(profile.primary_sport ?? "")} board for{" "}
              {profile.neighborhood ?? `ZIP ${profile.home_zip}`} is being built
              right now. Your spot is reserved.
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
      </div>
    </div>
  );
}
