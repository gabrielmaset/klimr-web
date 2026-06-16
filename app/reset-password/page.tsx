import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Reached via the recovery link, which establishes a session. No session →
  // start the flow over.
  if (!user) redirect("/forgot-password");

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <p className="kicker text-brand-deep">Account recovery</p>
      <h1 className="mt-2 font-display text-4xl text-ink">New password.</h1>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        Choose a strong password you don&apos;t use anywhere else.
      </p>
      <div className="mt-7">
        <ResetForm />
      </div>
    </div>
  );
}
