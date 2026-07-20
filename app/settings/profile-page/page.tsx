import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { GearEditor, type GearItem } from "@/components/gear-editor";
import { saveProfilePageSettings } from "./actions";

export const metadata: Metadata = { title: "Profile page · Settings · Klimr" };

export default async function ProfilePageSettings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/profile-page");
  const { data: p } = await supabase.from("profiles").select("gear, usual_times, show_courts, show_teams, show_tournaments").eq("id", user.id).maybeSingle();
  const gear = (Array.isArray(p?.gear) ? (p!.gear as unknown as GearItem[]) : []).filter((g) => g && typeof g.model === "string");

  const toggle = (name: string, label: string, desc: string, checked: boolean) => (
    <label className="flex items-start justify-between gap-4 rounded-2xl border border-rule bg-bg px-4 py-3.5">
      <span>
        <span className="block text-sm font-bold text-ink">{label}</span>
        <span className="mt-0.5 block text-xs text-mute">{desc}</span>
      </span>
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1 h-4.5 w-4.5 accent-[#E23E0D]" />
    </label>
  );

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Settings", href: "/settings" }, { label: "Profile page" }]} />
      <Link href="/settings" className="press inline-flex items-center gap-1.5 text-sm text-mute transition-colors hover:text-ink">
        <ArrowLeft size={15} /> Settings
      </Link>
      <div className="mb-6 mt-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">Settings — Profile page</p>
        <h1 className="mt-1.5 font-display text-[40px] font-bold leading-none tracking-[-0.025em] text-ink">Your public profile</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">What other players see when they open your profile — privacy for your activity panels, your gear bag, and your usual playing times.</p>
        <Link href={`/profile/${user.id}`} className="press mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-deep hover:underline">
          <Eye size={13} /> View your public profile
        </Link>
      </div>

      {saved ? <p className="mb-4 rounded-[12px] border border-[#cfe3d2] bg-[#f2f9f3] px-3.5 py-2.5 text-[13px] font-semibold text-[#1f7a33]">Saved — your profile reflects it now.</p> : null}

      <form action={saveProfilePageSettings} className="grid max-w-2xl gap-6">
        <section className="rounded-3xl border border-rule bg-surface shadow-e1 p-5">
          <h2 className="text-sm font-bold text-ink">Privacy</h2>
          <p className="mt-0.5 text-xs text-mute">Panels switched off disappear from your public profile entirely.</p>
          <div className="mt-3 grid gap-2.5">
            {toggle("show_courts", "Courts you play at", "Derived from your recent matches — visitors see up to three.", p?.show_courts ?? true)}
            {toggle("show_teams", "Your teams", "Team names, your role, and links to team pages.", p?.show_teams ?? true)}
            {toggle("show_tournaments", "Your tournaments", "Active entries and live-bracket status.", p?.show_tournaments ?? true)}
          </div>
        </section>

        <section className="rounded-3xl border border-rule bg-surface shadow-e1 p-5">
          <h2 className="text-sm font-bold text-ink">Gear bag <span className="ml-1 font-mono text-[9px] font-bold uppercase tracking-wider text-faint">Optional</span></h2>
          <p className="mt-0.5 text-xs text-mute">What you play with — shows on your profile only when you list something.</p>
          <div className="mt-3"><GearEditor initial={gear} /></div>
        </section>

        <section className="rounded-3xl border border-rule bg-surface shadow-e1 p-5">
          <h2 className="text-sm font-bold text-ink">Usual times <span className="ml-1 font-mono text-[9px] font-bold uppercase tracking-wider text-faint">Optional</span></h2>
          <p className="mt-0.5 text-xs text-mute">Shown under your courts — helps people know when to challenge you.</p>
          <input name="usual_times" defaultValue={p?.usual_times ?? ""} maxLength={90} placeholder="Weekday evenings · weekend mornings" className="mt-3 h-10 w-full rounded-[12px] border border-rule-2 bg-bg px-3.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand" />
        </section>

        <button className="press w-fit rounded-full px-5 py-2.5 text-sm font-bold text-white hover:brightness-[1.06]" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
          Save profile page
        </button>
      </form>
    </div>
  );
}
