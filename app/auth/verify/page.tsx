import type { Metadata } from "next";
import Link from "next/link";
import { AutoConfirm } from "./AutoConfirm";

export const metadata: Metadata = { title: "Signing in" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;

  if (!token_hash || !type) {
    return (
      <div className="mx-auto max-w-sm px-5 py-16">
        <p className="kicker text-brand-deep">Sign in</p>
        <h1 className="mt-2 font-display text-4xl text-ink">Link incomplete.</h1>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          This sign-in link is missing information. Request a fresh one and open
          the newest email.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block font-semibold text-ink underline underline-offset-2 transition-colors hover:text-brand-deep"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <p className="kicker text-brand-deep">Almost there</p>
      <h1 className="mt-2 font-display text-4xl text-ink">Signing you in.</h1>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        Finishing up on this device — you&rsquo;ll go straight to the two-factor check.
      </p>
      <AutoConfirm token_hash={token_hash} type={type} next={next ?? "/account"} />
      <p className="mt-4 text-xs leading-relaxed text-faint">
        If nothing happens, tap Continue. This step keeps automated email scanners
        from using up your link before you do.
      </p>
    </div>
  );
}
