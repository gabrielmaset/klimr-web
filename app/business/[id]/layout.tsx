import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BusinessNav } from "@/components/business-nav";
import { TopBar } from "@/components/top-bar";
import { getTopBarData } from "@/lib/chrome-data";

/** The business portal (Gabriel's model): entered by clicking the business
 *  name in the lower menu, it replaces the app chrome with its own rail —
 *  exactly the tournament-workspace contract. Any member may enter (staff
 *  read-mostly; writes stay manager-gated by RLS and the actions); everyone
 *  else is sent to the public page when one is visible. The whole portal
 *  stays dark behind `business_publication`. */
export default async function BusinessPortalLayout({
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
  if (!user) redirect(`/login?next=/business/${id}`);

  const { data: flag } = await supabase.from("feature_flags").select("enabled").eq("key", "business_publication").maybeSingle();
  if (!flag?.enabled) notFound();

  const { data: b } = await supabase
    .from("business_accounts")
    .select("id, slug, name, kind, verification_level, status")
    .eq("id", id)
    .maybeSingle();
  if (!b) notFound();

  const { data: membership } = await supabase
    .from("business_members")
    .select("role")
    .eq("business_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) redirect(`/b/${b.slug}`);

  const { data: profile } = await supabase.from("profiles").select("display_name, avatar_hue, avatar_path").eq("id", user.id).maybeSingle();
  const personal = {
    name: profile?.display_name || user.email || "You",
    hue: profile?.avatar_hue ?? 200,
    url: profile?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(profile.avatar_path).data.publicUrl : null,
  };

  const bar = await getTopBarData(supabase, user.id);

  return (
    <div className="md:flex md:min-h-dvh">
      <BusinessNav
        business={{ id: b.id, slug: b.slug, name: b.name, kind: b.kind, verification_level: b.verification_level, status: b.status }}
        role={membership.role}
        personal={personal}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="pt-safe sticky top-0 z-40 flex items-center gap-2 border-b border-rule bg-[#FFFDF8]/85 px-3 py-2 backdrop-blur-md md:hidden">
          <Link href="/settings" className="press inline-flex items-center gap-1 rounded-full border border-rule bg-surface px-2.5 py-1.5 text-[12.5px] font-bold text-ink">
            <ArrowLeft size={13} strokeWidth={2.5} /> Klimr
          </Link>
          <p className="min-w-0 flex-1 truncate text-center text-[13px] font-bold text-ink">{b.name}</p>
          <span className="w-[68px]" aria-hidden />
        </div>
        <TopBar chatUnread={bar.chatUnread} unreadCount={bar.unread} presenceMode={bar.presenceMode} nextMatch={bar.nextMatch} teams={bar.teams} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
