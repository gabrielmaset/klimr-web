import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CreateMatchForm } from "./create-form";

export const metadata: Metadata = { title: "Organize a match" };

export default async function NewMatchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/play/new");

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
      <Link href="/play" className="press inline-flex items-center gap-1.5 text-sm text-mute transition-colors hover:text-ink">
        <ArrowLeft size={15} /> All matches
      </Link>
      <h1 className="mt-4 font-display text-4xl leading-none text-ink sm:text-5xl">Organize a match</h1>
      <p className="mt-1 text-sm text-mute">Set the where and when. Players nearby can join until it fills.</p>
      <CreateMatchForm />
    </div>
  );
}
