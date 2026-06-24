import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LegalEditor } from "@/components/legal-editor";
import type { TournamentFormatConfig } from "@/lib/tournament";

export default async function LegalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/legal`);

  const { data: t } = await supabase.from("tournaments").select("id, format_config").eq("id", id).maybeSingle();
  if (!t) notFound();
  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const legal = fc.legal ?? {};

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Setup</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Legal</h1>
        <p className="mt-2 max-w-2xl text-sm text-mute">
          The liability waiver and rules participants agree to. Turn on a requirement to make players accept it before their entry is confirmed; the rules also appear on your public event page.
        </p>
      </div>
      <LegalEditor
        tournamentId={t.id}
        initial={{
          waiver_text: legal.waiver_text ?? "",
          rules_text: legal.rules_text ?? "",
          require_waiver: !!legal.require_waiver,
          require_rules: !!legal.require_rules,
        }}
      />
    </div>
  );
}
