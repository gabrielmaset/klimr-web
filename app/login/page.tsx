import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

function safePath(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/account";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <p className="kicker text-brand-deep">Welcome back</p>
      <h1 className="mt-2 font-display text-4xl text-ink">Sign in.</h1>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        Email and password — or a one-time magic link.
      </p>
      <div className="mt-7">
        <LoginForm next={safePath(sp.next)} linkError={sp.error === "link"} />
      </div>
      <p className="mt-6 text-sm text-mute">
        New to Klimr?{" "}
        <Link href="/signup" className="font-semibold text-ink underline underline-offset-2 transition-colors hover:text-brand-deep">
          Sign up with your invite code
        </Link>
      </p>
    </div>
  );
}
