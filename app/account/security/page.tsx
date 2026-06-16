import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOutEverywhere } from "./actions";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: list } = await supabase.auth.mfa.listFactors();
  const factors = (list?.all ?? [])
    .filter((f) => f.factor_type === "totp" && f.status === "verified")
    .map((f) => ({
      id: f.id,
      name: f.friendly_name || "Authenticator",
      createdAt: f.created_at ?? "",
    }));

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 lg:py-16">
      <Link href="/account" className="text-sm text-mute transition-colors hover:text-ink">
        ← Account
      </Link>
      <h1 className="mt-3 font-display text-4xl text-ink sm:text-5xl">Security</h1>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        Your password, two-factor authentication, and active sessions.
      </p>

      <div className="mt-8 space-y-5">
        {/* Password */}
        <div className="rounded-3xl border border-rule bg-surface p-6">
          <div className="flex items-center gap-2">
            <KeyRound size={17} className="text-brand" aria-hidden />
            <span className="kicker text-faint">Password</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            <span className="font-mono text-[13px] text-ink">{user.email}</span>
          </p>
          <Link
            href="/reset-password"
            className="press mt-4 inline-block rounded-full border border-ink px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink hover:text-surface"
          >
            Change password
          </Link>
        </div>

        {/* Two-factor — read-only status */}
        <div className="rounded-3xl border border-rule bg-surface p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-success" aria-hidden />
            <span className="kicker text-faint">Two-factor authentication</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-tint-success px-3 py-1.5 text-sm font-bold text-success">
              <ShieldCheck size={14} aria-hidden /> On
            </span>
            <span className="text-[12px] text-mute">Required at every sign-in</span>
          </div>
          {factors.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {factors.map((f) => (
                <li key={f.id} className="flex items-center gap-3 rounded-2xl border border-rule bg-bg px-3.5 py-3">
                  <ShieldCheck size={16} className="shrink-0 text-mute" aria-hidden />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{f.name}</div>
                    {f.createdAt ? (
                      <div className="text-[12px] text-mute">
                        Added {new Date(f.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-[12px] leading-relaxed text-faint">
            Lost access to your authenticator app? Email{" "}
            <a href="mailto:hello@klimr.com?subject=Klimr%202FA%20help" className="underline underline-offset-2 hover:text-mute">
              hello@klimr.com
            </a>{" "}
            and we&apos;ll help you reset it.
          </p>
        </div>

        {/* Sessions */}
        <div className="rounded-3xl border border-rule bg-surface p-6">
          <div className="flex items-center gap-2">
            <LogOut size={17} className="text-brand" aria-hidden />
            <span className="kicker text-faint">Active sessions</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Signed in on a device you no longer use? Sign out everywhere — you
            can sign back in here whenever you like.
          </p>
          <form action={signOutEverywhere}>
            <button className="press mt-4 inline-flex items-center gap-2 rounded-full border border-rule px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink">
              <LogOut size={15} aria-hidden /> Sign out of all devices
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
