import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AvailabilityEditor } from "./availability-editor";

export const metadata: Metadata = { title: "Availability · Settings" };

type Range = { day: string; start: string; end: string };

export default async function AvailabilityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/availability");

  const { data: p } = await supabase.from("profiles").select("availability").eq("id", user.id).maybeSingle();
  const raw = Array.isArray(p?.availability) ? (p.availability as unknown[]) : [];
  const initial: Range[] = raw
    .filter((r): r is Range => !!r && typeof r === "object" && "day" in r && "start" in r && "end" in r)
    .map((r) => ({ day: String(r.day), start: String(r.start), end: String(r.end) }));

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10">
      <Link href="/settings" className="press mb-4 inline-flex items-center gap-1 text-sm font-semibold text-mute transition-colors hover:text-ink">
        <ChevronLeft size={16} /> Settings
      </Link>
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Availability schedule</h1>
      <p className="mt-2 text-sm text-mute">Add the times you&rsquo;re usually free to play, in 15-minute steps — as many blocks per day as you like. Change them anytime.</p>

      <div className="mt-6 rounded-2xl border border-rule bg-surface p-5 sm:p-6">
        <AvailabilityEditor initial={initial} />
      </div>
    </div>
  );
}
