import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaFlow } from "@/components/mfa-flow";

export const metadata: Metadata = { title: "Two-factor security" };

function safePath(v: string | undefined) {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/account";
}

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const dest = safePath(next);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Already fully authenticated (AAL2)? Don't make them re-do anything.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect(dest);

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <MfaFlow next={dest} />
    </div>
  );
}
