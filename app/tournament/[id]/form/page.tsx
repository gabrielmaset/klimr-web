import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CustomFieldsEditor } from "@/components/tournament-form-editor";
import type { CustomFieldRow } from "@/lib/tournament";

export default async function SignupFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/form`);

  const { data: t } = await supabase.from("tournaments").select("id, title, entry_type").eq("id", id).maybeSingle();
  if (!t) notFound();

  const { data: fields } = await supabase
    .from("tournament_custom_fields")
    .select("id, label, description, field_type, options, required, scope, sort_order")
    .eq("tournament_id", id)
    .order("sort_order");
  const entryType = t.entry_type === "individual" ? "individual" : "team";
  const initial: CustomFieldRow[] = (fields ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    description: f.description,
    field_type: f.field_type,
    options: Array.isArray(f.options) ? (f.options as string[]) : [],
    required: f.required,
    scope: f.scope,
    sort_order: f.sort_order,
  }));

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Registration</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Sign-up form</h1>
        <p className="mt-2 text-sm text-mute">
          Add the questions you want answered at registration.{" "}
          {entryType === "team" ? "Choose whether each is asked once per team or of every player." : "Each player answers these when they sign up."}
        </p>
      </div>
      <CustomFieldsEditor tournamentId={t.id} entryType={entryType} initial={initial} />
    </div>
  );
}
