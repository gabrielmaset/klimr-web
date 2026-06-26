import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

const PERKS = [
  "A ranked spot on your ZIP board",
  "Every opponent identity-verified",
  "Free during the Mar Vista beta",
];

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const cookieCode = (await cookies()).get("klimr_invite")?.value;
  const initialCode = (code ?? cookieCode ?? "").toUpperCase().slice(0, 40);
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
      {/* ---- left · the pitch ---- */}
      <div className="max-w-lg">
        <p className="kicker text-brand-deep">Invite only</p>
        <h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">
          Claim your <span className="italic">spot.</span>
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-mute">
          Got an invite code? Your place on the board starts here.
        </p>
        <div className="mt-7 space-y-1.5 rounded-2xl border border-rule bg-surface p-4">
          {PERKS.map((line) => (
            <p key={line} className="flex items-baseline gap-2 text-sm text-ink-soft">
              <span className="font-mono text-[11px] font-bold text-brand">→</span>
              {line}
            </p>
          ))}
        </div>
      </div>

      {/* ---- right · the form ---- */}
      <div className="w-full max-w-md lg:justify-self-end">
        <SignupForm initialCode={initialCode} />
        <p className="mt-6 text-sm text-mute">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-ink underline underline-offset-2 transition-colors hover:text-brand-deep"
          >
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
    </div>
  );
}
