import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KlimrLogo } from "@/components/logo";
import { hasGate } from "@/lib/gate";
import { enterSite } from "./actions";

export const metadata: Metadata = { title: "Klimr" };

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Members and visitors who've already entered a code skip the portal.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user || (await hasGate("site"))) redirect("/");

  const { error } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6">
      <KlimrLogo markSize={40} textClassName="text-[40px]" />

      <form action={enterSite} className="mt-12 w-full max-w-[18rem]">
        <input
          name="code"
          autoFocus
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Access code"
          aria-label="Access code"
          className="w-full rounded-xl border border-rule bg-surface px-4 py-3 text-center font-mono text-sm tracking-wider text-ink outline-none transition-colors placeholder:text-faint focus:border-ink"
        />
        {error ? (
          <p className="mt-3 text-center text-[13px] text-brand-deep">
            That code isn’t valid.
          </p>
        ) : null}
        <button
          type="submit"
          className="press mt-4 w-full rounded-full bg-ink py-3 text-sm font-bold text-surface transition-colors hover:bg-ink-soft"
        >
          Enter
        </button>
      </form>
    </main>
  );
}
