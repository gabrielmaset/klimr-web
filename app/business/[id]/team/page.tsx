import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Business team · Klimr" };
export const dynamic = "force-dynamic";

export default async function BusinessTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/business/${id}/team`);

  const { data: memberRows } = await supabase.from("business_members").select("user_id, role").eq("business_id", id);
  const members = (memberRows ?? []) as { user_id: string; role: string }[];
  const names = new Map<string, string>();
  if (members.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", members.map((m) => m.user_id));
    for (const p of (profs ?? []) as { id: string; display_name: string }[]) names.set(p.id, p.display_name);
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <PageHeader kicker="Business" title="Team" sub="Everyone who can act for this business." />
      <div className="mt-6 max-w-2xl rounded-2xl border border-rule bg-surface p-5 shadow-e1">
        <p className="kicker mb-3 flex items-center gap-1.5"><Users size={14} /> Members · {members.length}</p>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/profile/${m.user_id}`} className="min-w-0 truncate font-semibold text-ink hover:text-brand-deep">
                {names.get(m.user_id) ?? "Member"}
              </Link>
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-faint">{m.role}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11.5px] text-faint">Inviting teammates lands here soon.</p>
      </div>
    </div>
  );
}
