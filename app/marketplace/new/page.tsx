import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ListingForm } from "@/components/listing-form";

export const metadata: Metadata = { title: "List gear — Second Serve" };

export default async function NewListingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/marketplace/new");

  const { data: me } = await supabase.from("profiles").select("home_zip").eq("id", user.id).maybeSingle();

  return (
    <div className="mx-auto max-w-[880px] px-[30px] pb-16 pt-[22px]">
      <div className="mt-4">
        <PageHeader kicker="Marketplace — New listing" title="List gear" sub="A few honest details and a photo or two — that's the whole job." />
      </div>
      <div className="mt-6">
        <ListingForm formMode="create" defaultZip={me?.home_zip ?? null} />
      </div>
    </div>
  );
}
