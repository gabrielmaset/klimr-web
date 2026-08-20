import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KlimrLogo } from "@/components/logo";
import { hasGate } from "@/lib/gate";
import { GateForm } from "./gate-form";

export const metadata: Metadata = { title: "Klimr" };

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  // Members and visitors who've already entered a code skip the portal.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user || (await hasGate("site"))) redirect("/");

  const { error, sent } = await searchParams;
  const errorMessage =
    error === "empty"
      ? "No access code entered."
      : error === "throttled" || error === "locked"
        ? "Too many attempts. Please wait a few minutes and try again."
        : error === "captcha"
          ? "Please complete the verification challenge."
          : error
            ? "That code isn’t valid."
            : null;
  const noticeMessage = sent ? "If you have an active Klimr account, you’ll receive an access code by email shortly." : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6">
      <KlimrLogo markSize={40} textClassName="text-[40px]" />
      <GateForm errorMessage={errorMessage} noticeMessage={noticeMessage} />
    </main>
  );
}
