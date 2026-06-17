import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Download, Mail, ShieldCheck, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/auth/actions";
import { Avatar } from "@/components/avatar";
import { SettingsForm, type Prefs } from "./settings-form";
import { DeleteAccount } from "./delete-account";
import { unblockPlayer } from "./actions";

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

type BlockedProf = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const [{ data: prefRow }, { data: blocks }] = await Promise.all([
    supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id),
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

  let blocked: BlockedProf[] = [];
  const blockedIds = (blocks ?? []).map((b) => b.blocked_id);
  if (blockedIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_hue, avatar_path")
      .in("id", blockedIds);
    blocked = (profs as BlockedProf[] | null) ?? [];
  }
  const avatarUrl = (p: BlockedProf) =>
    p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
      <div className="mb-6">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Settings</h1>
        <p className="mt-1 text-sm text-mute">Manage your account, notifications, and privacy.</p>
      </div>

      {/* Account */}
      <Link
        href="/account"
        className="lift group flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4 sm:p-5"
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-tint-brand text-brand-deep">
          <UserRound size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-ink">Account &amp; profile</span>
          <span className="mt-0.5 block text-xs text-mute">Profile &amp; bio, sports &amp; skill levels, identity verification, email &amp; sign-in</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
      </Link>

      {/* Notifications + Privacy (client form) */}
      <div className="mt-4">
        <SettingsForm initial={prefs} />
      </div>

      {/* Blocked players */}
      <section className="mt-4 rounded-2xl border border-rule bg-surface p-4 sm:p-5">
        <h2 className="kicker text-faint">Blocked players</h2>
        {blocked.length === 0 ? (
          <p className="mt-2 text-sm text-mute">You haven&apos;t blocked anyone. Blocking hides a player from your feed and stops them from inviting you.</p>
        ) : (
          <ul className="mt-2 divide-y divide-rule">
            {blocked.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-3">
                <Avatar url={avatarUrl(b)} hue={b.avatar_hue ?? 200} name={b.display_name} size={36} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{b.display_name || "Player"}</span>
                <form action={unblockPlayer}>
                  <input type="hidden" name="userId" value={b.id} />
                  <button className="press rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-[#f4f4f5]">
                    Unblock
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Data & account */}
      <section className="mt-4 rounded-2xl border border-rule bg-surface p-4 sm:p-5">
        <h2 className="kicker text-faint">Data &amp; account</h2>
        <a
          href="/settings/export"
          className="lift mt-2 flex items-center gap-3 rounded-xl border border-rule p-3"
        >
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

      {/* Support + sign out */}
      <section className="mt-4 rounded-2xl border border-rule bg-surface p-4 sm:p-5">
        <h2 className="kicker text-faint">Support</h2>
        <a
          href="mailto:hello@klimr.com"
          className="lift mt-2 flex items-center gap-3 rounded-xl border border-rule p-3"
        >
          <Mail size={17} className="shrink-0 text-ink" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ink">Contact support</span>
            <span className="block text-xs text-mute">Questions or a problem to report? Email hello@klimr.com</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-faint" />
        </a>
        <form action={signOutAction} className="mt-4 border-t border-rule pt-4">
          <button className="press text-sm font-semibold text-mute transition-colors hover:text-ink">Sign out</button>
        </form>
      </section>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-faint">
        <ShieldCheck size={12} /> Klimr is invite-only and identity-verified. We never sell your data.
      </p>
    </div>
  );
}
