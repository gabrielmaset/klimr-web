import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, ShieldCheck, BadgeCheck } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

function safePath(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

const POINTS = [
  { Icon: KeyRound, title: "Passwordless", body: "We email a one-time sign-in link — nothing to remember or leak." },
  { Icon: ShieldCheck, title: "Two-factor protected", body: "A quick authenticator check keeps your account yours." },
  { Icon: BadgeCheck, title: "Invite-only & verified", body: "Every member is a real, identity-checked player." },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="mx-auto grid min-h-[68vh] max-w-5xl items-center gap-10 px-5 py-12 lg:grid-cols-2 lg:gap-16 lg:py-20">
      {/* welcome / value */}
      <div>
        <p className="kicker text-brand-deep">Welcome back</p>
        <h1 className="mt-2 font-display text-5xl leading-[1.04] text-ink sm:text-6xl">Sign in to Klimr.</h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-mute">
          No passwords here. Enter your email and we&rsquo;ll send a one-time sign-in link, then a quick two-factor check.
        </p>
        <ul className="mt-8 space-y-4">
          {POINTS.map(({ Icon, title, body }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tint-brand text-brand-deep">
                <Icon size={18} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{title}</span>
                <span className="block text-sm text-mute">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* form */}
      <div className="rounded-3xl border border-rule bg-surface p-6 shadow-[0_1px_2px_rgba(10,10,11,.05),0_24px_48px_-24px_rgba(10,10,11,.22)] sm:p-8">
        <LoginForm next={safePath(sp.next)} linkError={sp.error === "link"} />
        <p className="mt-6 border-t border-rule/70 pt-5 text-sm text-mute">
          New to Klimr?{" "}
          <Link href="/signup" className="font-semibold text-ink underline underline-offset-2 transition-colors hover:text-brand-deep">
            Sign up with your invite code
          </Link>
        </p>
      </div>
    </div>
  );
}
