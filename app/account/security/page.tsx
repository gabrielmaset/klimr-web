import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, ShieldCheck, Monitor, Smartphone, MapPin, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOutEverywhere } from "./actions";
import { summarizeUA } from "@/lib/useragent";

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

  const { data: loginRows } = await supabase
    .from("login_events")
    .select("id, created_at, ip, device, browser, os, city, region, country")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const logins = loginRows ?? [];
  const placeOf = (e: { city: string | null; region: string | null; country: string | null }) =>
    [e.city, e.region, e.country].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-12 lg:py-16">
      <Link href="/account" className="text-sm text-mute transition-colors hover:text-ink">
        ← Account
      </Link>
      <h1 className="mt-3 font-display text-4xl text-ink sm:text-5xl">Security</h1>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        Your sign-in, two-factor authentication, and active sessions.
      </p>

      <div className="mt-8 space-y-5">
        {/* Sign-in method */}
        <div className="rounded-3xl border border-rule bg-surface p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck size={17} className="text-brand" aria-hidden />
            <span className="kicker text-faint">Sign-in</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            Klimr is passwordless. You sign in with a one-time magic link sent to{" "}
            <span className="font-mono text-[13px] text-ink">{user.email}</span>, then confirm with your authenticator app — there&apos;s no password to manage or leak.
          </p>
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
            <Clock size={17} className="text-brand" aria-hidden />
            <span className="kicker text-faint">Recent sign-ins</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            The most recent times your account completed sign-in, with the device and approximate location.
            See something you don&apos;t recognize? Sign out of all devices below and email{" "}
            <a href="mailto:hello@klimr.com?subject=Klimr%20security" className="underline underline-offset-2 hover:text-ink">hello@klimr.com</a>.
          </p>
          {logins.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {logins.map((e, i) => {
                const place = placeOf(e);
                const isMobile = e.device === "Mobile";
                return (
                  <li key={e.id} className="flex items-start gap-3 rounded-2xl border border-rule bg-bg px-3.5 py-3">
                    {isMobile ? <Smartphone size={16} className="mt-0.5 shrink-0 text-mute" aria-hidden /> : <Monitor size={16} className="mt-0.5 shrink-0 text-mute" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold text-ink">{summarizeUA(e)}</span>
                        {e.device ? <span className="text-[12px] text-faint">· {e.device}</span> : null}
                        {i === 0 ? <span className="rounded-full bg-tint-success px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">Most recent</span> : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-mute">
                        {place ? (
                          <span className="flex items-center gap-1"><MapPin size={12} aria-hidden /> {place}</span>
                        ) : (
                          <span>Location unavailable</span>
                        )}
                        {e.ip ? <span className="font-mono text-faint">{e.ip}</span> : null}
                      </div>
                      <div className="mt-0.5 text-[12px] text-faint">
                        {new Date(e.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 rounded-2xl border border-rule bg-bg px-3.5 py-3 text-sm text-mute">No sign-ins recorded yet — they&apos;ll appear here after your next sign-in.</p>
          )}
        </div>

        {/* Active sessions */}
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
