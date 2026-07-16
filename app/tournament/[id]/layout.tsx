import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TournamentNav } from "@/components/tournament-nav";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { getTopBarData } from "@/lib/chrome-data";

export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}`);

  const { data: t } = await supabase.from("tournaments").select("id, code, title, sport_key, status, owner_id, suspended_at, suspended_reason").eq("id", id).maybeSingle();
  if (!t) notFound();

  // Only the owner and managers enter the workspace; everyone else gets the public page.
  let role: "owner" | "manager" | null = t.owner_id === user.id ? "owner" : null;
  if (!role) {
    const { data: m } = await supabase.from("tournament_managers").select("role").eq("tournament_id", id).eq("user_id", user.id).maybeSingle();
    if (m) role = "manager";
  }
  if (!role) redirect(`/e/${t.code}`);

  const { data: profile } = await supabase.from("profiles").select("display_name, avatar_hue, avatar_path").eq("id", user.id).maybeSingle();
  const personal = {
    name: profile?.display_name || user.email || "You",
    hue: profile?.avatar_hue ?? 200,
    url: profile?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl : null,
  };

  // The workspace renders its own left sidebar but still shows the global top
  // bar (search, presence, next match, notifications, account) across the top.
  const bar = await getTopBarData(supabase, user.id);

  return (
    <div className="md:flex md:min-h-dvh">
      <TournamentNav tournament={{ id: t.id, code: t.code, title: t.title, sport_key: t.sport_key, status: t.status }} role={role} personal={personal} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The rail and TopBar are md+ — on phones the workspace had no chrome
            at all (no way back to Klimr). This slim strip is the mobile chrome. */}
        <div className="pt-safe sticky top-0 z-40 flex items-center gap-2 border-b border-rule bg-[#FFFDF8]/85 px-3 py-2 backdrop-blur-md md:hidden">
          <Link href="/tournaments" className="press inline-flex items-center gap-1 rounded-full border border-rule bg-surface px-2.5 py-1.5 text-[12.5px] font-bold text-ink">
            <ArrowLeft size={13} strokeWidth={2.5} /> Klimr
          </Link>
          <p className="min-w-0 flex-1 truncate text-center text-[13px] font-bold text-ink">{t.title}</p>
          <span className="w-[68px]" aria-hidden />
        </div>
        <TopBar chatUnread={bar.chatUnread} unreadCount={bar.unread} presenceMode={bar.presenceMode} nextMatch={bar.nextMatch} teams={bar.teams} />
        {t.suspended_at ? (
          <div className="border-b border-brand/30 bg-tint-brand px-5 py-3">
            <p className="mx-auto max-w-page text-sm font-semibold text-brand-deep">
              This event is suspended for review and isn&rsquo;t visible to the public.
              {t.suspended_reason ? <span className="font-normal text-ink-soft"> Reason: {t.suspended_reason}.</span> : null}
              <span className="font-normal text-ink-soft"> Contact support@klimr.com with any questions.</span>
            </p>
          </div>
        ) : null}
        <main className="min-w-0 flex-1 overflow-x-clip">{children}</main>
      </div>
    </div>
  );
}
