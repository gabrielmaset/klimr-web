import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isApprovedProvider } from "@/app/classes/actions";
import { ClassCreateForm } from "@/components/class-create-form";

export const metadata: Metadata = { title: "Create a class" };

export default async function NewClassPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/classes/new");
  if (!(await isApprovedProvider(user.id))) redirect("/classes");

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <Link href="/classes" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-mute transition-colors hover:text-ink">
        <ArrowLeft size={16} /> Back to classes
      </Link>
      <div className="mb-6">
        <p className="kicker text-brand-deep">Coach tools</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Create a class</h1>
      </div>
      <ClassCreateForm />
    </div>
  );
}
