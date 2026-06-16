import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { confirmSignIn } from "./actions";

export const metadata: Metadata = { title: "Confirm sign-in" };

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
      <h1 className="mt-2 font-display text-4xl text-ink">Confirm sign-in.</h1>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        One last tap to finish signing in to Klimr on this device.
      </p>
      <form action={confirmSignIn} className="mt-7">
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next ?? "/account"} />
        <button
          type="submit"
          className="press flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-3.5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep"
        >
          <MailCheck size={18} aria-hidden />
          Confirm sign-in
        </button>
      </form>
      <p className="mt-4 text-xs leading-relaxed text-faint">
        This extra tap keeps automated email scanners from using up your link
        before you do.
      </p>
    </div>
  );
}
