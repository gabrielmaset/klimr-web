import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreatePasswordForm } from "./create-form";

export const metadata: Metadata = { title: "Create your password" };

export default async function CreatePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Reached from the confirmation link, which establishes a session. No session
  // → the link wasn't opened on this device; send them to sign in.
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <p className="kicker text-brand-deep">You&apos;re in</p>
      <h1 className="mt-2 font-display text-4xl text-ink">Create a password.</h1>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        Email confirmed. Set a password to secure your account — next you&apos;ll
        set up two-factor, then build your profile.
      </p>
      <div className="mt-7">
        <CreatePasswordForm email={user.email ?? ""} />
      </div>
    </div>
  );
}
