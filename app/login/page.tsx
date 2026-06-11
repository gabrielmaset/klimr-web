import type { Metadata } from "next";
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
        No password — we email you a magic link.
      </p>
      <div className="mt-7">
        <LoginForm next={safePath(sp.next)} linkError={sp.error === "link"} />
      </div>
    </div>
  );
}
