import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BadgeCheck, MapPin, ShieldCheck, ChevronRight, CalendarDays, Users, Settings,
  Radar, Flag, ShoppingBag, BookOpen, Sparkles, Bell, Gift, Mail, KeyRound,
  Trophy, UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { startVerification, approveVerification } from "./actions";
import { signOutAction } from "@/app/auth/actions";
import { Avatar } from "@/components/avatar";
import { PresenceControl } from "@/app/settings/presence-control";
import type { PresenceMode } from "@/app/account/presence";
import { sportMeta } from "@/lib/sports";

export const metadata: Metadata = { title: "Your account" };

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

  const [{ data: profile }, { data: mySports }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, home_zip, neighborhood, city, state, primary_sport, verification_status, avatar_hue, avatar_path, bio, availability, presence_mode",
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("player_sports")
      .select("sport_key, skill_rating")
      .eq("user_id", user.id)
      .eq("active", true),
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
  const sportsList = mySports ?? [];
  const sportCount = sportsList.length;
  const hasRating = sportsList.some((s) => s.skill_rating != null);
  const primary = sportMeta(profile.primary_sport);
  const presenceMode = (profile.presence_mode as PresenceMode) ?? "auto";

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

  const manage = [
    { href: "/settings/profile", Icon: UserRound, title: "Profile & bio", desc: "Photo, name, bio, date of birth, and area" },
    { href: "/settings/sports", Icon: Trophy, title: "Sports & skill levels", desc: `${sportCount} ${sportCount === 1 ? "sport" : "sports"} · levels and ratings` },
    { href: "/settings/availability", Icon: CalendarDays, title: "Availability", desc: slots > 0 ? `Free ${slots} ${slots === 1 ? "block" : "blocks"} a week` : "Set when you usually play" },
    { href: "/settings/email", Icon: Mail, title: "Linked email & phone", desc: "How you sign in and get reached" },
    { href: "/account/security", Icon: KeyRound, title: "Sign-in & security", desc: "Magic link and two-factor" },
    { href: "/settings", Icon: Settings, title: "All settings", desc: "Notifications, privacy, teams, and more" },
  ];

  return (
    <div className="mx-auto max-w-page px-5 py-12 lg:py-16">
      {sp.welcome === "1" ? (
        <div className="rise mb-5 rounded-2xl border border-brand bg-tint-brand px-4 py-3.5 text-sm leading-relaxed text-ink">
          <span className="font-bold">Welcome to the board, {firstName}.</span>{" "}
          Your profile is in. One step left before your matches count — verify your identity below.
          {sp.note === "area" ? (
            <> (We have not mapped your area&apos;s neighborhoods yet; your ZIP-level ranking works from day one.)</>
          ) : null}
        </div>
      ) : sp.note === "area" ? (
        <div className="rise mb-5 rounded-2xl border border-pop bg-pop/25 px-4 py-3 text-sm leading-snug text-ink">
          Saved! We have not mapped your area&apos;s neighborhoods yet — your ZIP-level ranking works from day one, and the rest fills in as Klimr expands.
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl text-ink sm:text-5xl">Your account</h1>
        <form action={signOutAction}>
          <button className="press text-sm font-semibold text-mute transition-colors hover:text-ink">Sign out</button>
        </form>
      </div>

      {/* secondary navigation — shown on mobile where there's no sidebar */}
      <nav className="mt-5 grid grid-cols-2 gap-2 md:hidden" aria-label="More">
        {[
          { href: "/settings", label: "Settings", Icon: Settings },
          { href: "/discover", label: "Discover", Icon: Radar },
          { href: "/challenges", label: "Challenges", Icon: Flag },
          { href: "/teams", label: "Teams", Icon: Users },
          { href: "/courts", label: "Courts", Icon: MapPin },
          { href: "/events", label: "Events", Icon: CalendarDays },
          { href: "/marketplace", label: "Marketplace", Icon: ShoppingBag },
          { href: "/sponsorships", label: "Sponsorships", Icon: Sparkles },
          { href: "/resources", label: "Resources", Icon: BookOpen },
          { href: "/invite", label: "Invite friends", Icon: Gift, soon: true },
          { href: "/notifications", label: "Notifications", Icon: Bell },
        ].map(({ href, label, Icon, soon }) => (
          <Link
            key={href}
            href={href}
            className="lift flex items-center gap-2.5 rounded-2xl border border-rule bg-surface shadow-e1 p-3"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-bg text-ink">
              <Icon size={16} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{label}</span>
            {soon ? (
              <span className="shrink-0 rounded-full bg-bg px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-faint">Soon</span>
            ) : (
              <ChevronRight size={16} className="shrink-0 text-faint" />
            )}
          </Link>
        ))}
      </nav>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        {/* ---------------- LEFT · identity + manage ---------------- */}
        <div className="space-y-5">
          {/* identity hero */}
          <div className="rise rounded-3xl border border-rule bg-surface shadow-e1 p-6">
            <div className="flex items-start gap-4">
              <Avatar url={photoUrl} hue={hue} name={name} size={72} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xl font-bold text-ink">{name}</span>
                  {v === "verified" ? (
                    <BadgeCheck size={17} className="shrink-0 text-brand-deep" aria-label="Verified" />
                  ) : null}
                </div>
                <div id="email" className="scroll-mt-24 font-mono text-[12px] text-mute">{user.email}</div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
                  <span className="inline-flex items-center gap-1">
                    <span aria-hidden>{primary.emoji}</span>
                    {primary.name}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={13} className="text-brand" aria-hidden />
                    {home}
                  </span>
                </div>
              </div>
            </div>

            {profile.bio ? (
              <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-soft">{profile.bio}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/me"
                className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-bg"
              >
                View public profile
              </Link>
              <Link
                href="/settings/profile"
                className="press rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft"
              >
                Edit profile
              </Link>
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

          {/* manage */}
          <div className="rise rounded-3xl border border-rule bg-surface shadow-e1 p-4 sm:p-5" style={{ animationDelay: "60ms" }}>
            <div className="kicker px-2 pb-1 pt-1 text-faint">Manage</div>
            <div className="grid gap-1 sm:grid-cols-2">
              {manage.map(({ href, Icon, title, desc }) => (
                <Link
                  key={href}
                  href={href}
                  className="press flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-bg"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bg text-ink">
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{title}</span>
                    <span className="block truncate text-xs text-mute">{desc}</span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-faint" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ---------------- RIGHT · account status ---------------- */}
        <div className="space-y-5">
          {/* Security */}
          <div className="rise rounded-3xl border border-rule bg-surface shadow-e1 p-6">
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

          {/* Verification */}
          <div id="verification" className="rise scroll-mt-24 rounded-3xl border border-rule bg-surface shadow-e1 p-6" style={{ animationDelay: "90ms" }}>
            <div className="kicker text-faint">Identity verification</div>
            <p className="mt-2 text-sm leading-relaxed text-mute">
              Every Klimr player is verified — it&apos;s the trust floor for rankings and matches.
            </p>
            <div className="mt-4">
              {v === "verified" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-tint-success px-3 py-1.5 text-sm font-bold text-success">
                  <BadgeCheck size={15} aria-hidden /> Verified
                </span>
              ) : v === "pending" ? (
                <div className="space-y-3">
                  <span className="inline-flex items-center rounded-full bg-pop px-3 py-1.5 text-sm font-bold text-ink">Under review</span>
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

          {/* Online status */}
          <div className="rise rounded-3xl border border-rule bg-surface shadow-e1 p-6" style={{ animationDelay: "180ms" }}>
            <div className="kicker text-faint">Online status</div>
            <p className="mt-2 text-sm leading-relaxed text-mute">
              Sets the status dot others see. You can also switch it anytime from the pill in your top bar.
            </p>
            <div className="mt-4">
              <PresenceControl initialMode={presenceMode} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
