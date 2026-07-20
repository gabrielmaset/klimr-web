import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { redirect } from "next/navigation";
import { Ban } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";
import { unblockPlayer } from "../actions";

export const metadata: Metadata = { title: "Blocked players · Settings" };

type BlockedProf = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null };

export default async function BlockedPlayersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/blocked");

  const { data: blocks } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id);
  const ids = (blocks ?? []).map((b) => b.blocked_id);
  let blocked: BlockedProf[] = [];
  if (ids.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_hue, avatar_path")
      .in("id", ids);
    blocked = (profs as BlockedProf[] | null) ?? [];
  }
  const avatarUrl = (p: BlockedProf) =>
    p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null;

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Settings", href: "/settings" }, { label: "Blocked players" }]} />
      <BackButton fallback="/settings" label="Settings" className="press mb-4 inline-flex items-center gap-1 text-sm font-semibold text-mute transition-colors hover:text-ink" />
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Blocked players</h1>
      <p className="mt-2 text-sm text-mute">Blocking hides a player from your feed and stops them from inviting you. You can block someone from their profile, and unblock them here anytime.</p>

      <section className="mt-6 rounded-2xl border border-rule bg-surface shadow-e1 p-2 sm:p-3">
        {blocked.length === 0 ? (
          <div className="rounded-xl px-4 py-12 text-center">
            <Ban size={22} className="mx-auto text-faint" />
            <p className="mx-auto mt-3 max-w-xs text-sm text-mute">You haven&rsquo;t blocked anyone.</p>
          </div>
        ) : (
          <ul className="divide-y divide-rule">
            {blocked.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-2 py-3">
                <Avatar url={avatarUrl(b)} hue={b.avatar_hue ?? 200} name={b.display_name} size={40} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{b.display_name || "Player"}</span>
                <form action={unblockPlayer}>
                  <input type="hidden" name="userId" value={b.id} />
                  <button className="press rounded-full border border-rule px-4 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-bg">
                    Unblock
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
