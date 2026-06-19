import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChevronRight, Download, Mail, ShieldCheck, UserRound, Trophy, BadgeCheck, KeyRound,
  MapPin, Swords, CalendarDays, BookOpen, Users, CreditCard, LifeBuoy, FileText, ScrollText, Send, Ban,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOutAction, signOutEverywhereAction } from "@/app/auth/actions";
import { Avatar } from "@/components/avatar";
import { SettingsForm, type Prefs } from "./settings-form";
import { DeleteAccount } from "./delete-account";

export const metadata: Metadata = { title: "Settings" };

const DEFAULTS: Prefs = {
  notif_match_invites: true,
  notif_ranking_changes: true,
  notif_region_challenges: true,
  notif_marketplace_events: true,
  email_digest: "weekly",
  profile_visibility: "members",
  location_precision: "neighborhood",
  who_can_invite: "anyone",
};

type RowDef = { Icon: typeof UserRound; title: string; desc: string; href?: string; soon?: boolean };

function Section({ title, rows }: { title: string; rows: RowDef[] }) {
  return (
    <section className="rounded-2xl border border-rule bg-surface p-3">
      <h2 className="kicker px-2 pb-2.5 pt-1 text-faint">{title}</h2>
      <div className="space-y-1">
        {rows.map((r) => {
          const inner = (
            <>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4f4f5] text-ink">
                <r.Icon size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{r.title}</span>
                  {r.soon ? (
                    <span className="rounded-full bg-[#f4f4f5] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-faint">Soon</span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-mute">{r.desc}</span>
              </span>
              {r.href ? <ChevronRight size={16} className="shrink-0 text-faint" /> : null}
            </>
          );
          return r.href ? (
            <Link key={r.title} href={r.href} className="press flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-bg">
              {inner}
            </Link>
          ) : (
            <div key={r.title} className="flex items-center gap-3 rounded-xl px-3 py-3 opacity-70">{inner}</div>
          );
        })}
      </div>
    </section>
  );
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const [{ data: prefRow }, { data: blocks }, { data: profile }] = await Promise.all([
    supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id),
    supabase.from("profiles").select("display_name, avatar_hue, avatar_path, verification_status, city, neighborhood").eq("id", user.id).maybeSingle(),
  ]);

  const prefs: Prefs = prefRow
    ? {
        notif_match_invites: prefRow.notif_match_invites,
        notif_ranking_changes: prefRow.notif_ranking_changes,
        notif_region_challenges: prefRow.notif_region_challenges,
        notif_marketplace_events: prefRow.notif_marketplace_events,
        email_digest: prefRow.email_digest,
        profile_visibility: prefRow.profile_visibility,
        location_precision: prefRow.location_precision,
        who_can_invite: prefRow.who_can_invite,
      }
    : DEFAULTS;

  const blockedCount = (blocks ?? []).length;
  const myAvatar = profile?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl : null;
  const place = [profile?.neighborhood, profile?.city].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
      <div className="mb-6">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Settings</h1>
        <p className="mt-1 text-sm text-mute">Manage your account, play, notifications, teams, and privacy.</p>
      </div>

      {/* identity header → profile */}
      <Link href="/me" className="lift mb-5 flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4 sm:p-5">
        <Avatar url={myAvatar} hue={profile?.avatar_hue ?? 18} name={profile?.display_name ?? "You"} size={52} ring />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-ink">{profile?.display_name ?? "You"}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-mute">
            {place || "Set your area"}
            {profile?.verification_status === "verified" ? (
              <span className="inline-flex items-center gap-1 text-brand-deep"><BadgeCheck size={12} /> Verified</span>
            ) : null}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-faint" />
      </Link>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          <Section
            title="Account"
            rows={[
              { Icon: UserRound, title: "Profile & bio", desc: "Name, bio, date of birth, and area", href: "/settings/profile" },
              { Icon: Trophy, title: "Sports & skill levels", desc: "The sports you play and your levels", href: "/settings/sports" },
              { Icon: BadgeCheck, title: "Identity verification", desc: "Your verified-player status", href: "/settings/verification" },
              { Icon: Mail, title: "Linked email & phone", desc: "How you sign in and get reached", href: "/settings/email" },
              { Icon: KeyRound, title: "Sign-in & security", desc: "Magic link and two-factor", href: "/account/security" },
            ]}
          />
          <Section
            title="Ranking & play"
            rows={[
              { Icon: MapPin, title: "Home ZIP & neighborhood", desc: "Anchors your local rankings", href: "/settings/profile" },
              { Icon: Swords, title: "Default sport", desc: "What opens first across Klimr", href: "/settings/sports" },
              { Icon: CalendarDays, title: "Availability schedule", desc: "When you usually play", href: "/settings/availability" },
              { Icon: BookOpen, title: "Sport rules & how to play", desc: "Formats and how ranking points work", href: "/resources" },
            ]}
          />
          <Section
            title="Teams"
            rows={[
              { Icon: Users, title: "My teams", desc: "Crews and squads you're on", href: "/teams" },
              { Icon: Send, title: "Team invitations", desc: "Invites waiting on you", href: "/invites?tab=received&kind=teams" },
              { Icon: ShieldCheck, title: "Team notifications", desc: "Invites and roster changes", soon: true },
            ]}
          />
          <Section
            title="Payments"
            rows={[
              { Icon: CreditCard, title: "Payment methods", desc: "For coaching and marketplace", soon: true },
              { Icon: ScrollText, title: "Marketplace purchase history", desc: "Your orders and receipts", soon: true },
              { Icon: CalendarDays, title: "Coaching bookings", desc: "Sessions you've booked", soon: true },
            ]}
          />
        </div>

        <div className="space-y-5">
          {/* Notifications + Privacy (client form, saves) */}
          <SettingsForm initial={prefs} />

          {/* Blocked players → own page */}
          <Section
            title="Privacy"
            rows={[
              { Icon: Ban, title: "Blocked players", desc: blockedCount > 0 ? `${blockedCount} blocked · hidden from your feed and invites` : "No one blocked yet", href: "/settings/blocked" },
            ]}
          />

          {/* Data & account */}
          <section className="rounded-2xl border border-rule bg-surface p-4 sm:p-5">
            <h2 className="kicker text-faint">Data &amp; account</h2>
            <a href="/settings/export" className="lift mt-2 flex items-center gap-3 rounded-xl border border-rule p-3">
              <Download size={17} className="shrink-0 text-ink" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">Download my data</span>
                <span className="block text-xs text-mute">A JSON copy of your profile, sports, posts, and settings</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-faint" />
            </a>
            <div className="mt-4 border-t border-rule pt-4">
              <p className="mb-2 text-sm font-semibold text-ink">Delete account</p>
              <DeleteAccount />
            </div>
          </section>

          {/* Support */}
          <Section
            title="Support"
            rows={[
              { Icon: LifeBuoy, title: "Contact support", desc: "Questions, a bug, or a player to report", href: "/support" },
              { Icon: BookOpen, title: "Help center", desc: "Guides and answers", href: "/help" },
              { Icon: ShieldCheck, title: "Community guidelines", desc: "How we keep Klimr safe & fair", href: "/guidelines" },
              { Icon: FileText, title: "Terms & privacy", desc: "Your agreement and data rights", href: "/legal" },
            ]}
          />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
            <form action={signOutAction}>
              <button className="press text-sm font-semibold text-mute transition-colors hover:text-ink">Sign out</button>
            </form>
            <form action={signOutEverywhereAction}>
              <button className="press text-sm font-semibold text-mute transition-colors hover:text-ink">Sign out of all devices</button>
            </form>
          </div>
        </div>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-faint">
        <ShieldCheck size={12} /> Klimr is invite-only and identity-verified. We never sell your data.
      </p>
    </div>
  );
}
