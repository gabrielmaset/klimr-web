import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <p className="kicker text-brand-deep">Invite only</p>
      <h1 className="mt-2 font-display text-4xl text-ink">
        Claim your <span className="italic">spot.</span>
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        Got an invite code? Your place on the board starts here.
      </p>
      <div className="mt-5 space-y-1.5 rounded-2xl border border-rule bg-surface p-4">
        {[
          "A ranked spot on your ZIP board",
          "Every opponent identity-verified",
          "Free during the Mar Vista beta",
        ].map((line) => (
          <p key={line} className="flex items-baseline gap-2 text-sm text-ink-soft">
            <span className="font-mono text-[11px] font-bold text-brand">→</span>
            {line}
          </p>
        ))}
      </div>
      <div className="mt-5">
        <SignupForm />
      </div>
      <p className="mt-6 text-sm text-mute">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-ink underline underline-offset-2 transition-colors hover:text-brand-deep">
          Sign in
        </Link>
        <span className="px-1.5 text-faint">·</span>
        No code yet?{" "}
        <a
          href="mailto:hello@klimr.com?subject=Klimr%20invite%20request"
          className="font-semibold text-ink underline underline-offset-2 transition-colors hover:text-brand-deep"
        >
          Request an invite
        </a>
      </p>
    </div>
  );
}
