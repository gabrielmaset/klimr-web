import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Only ever redirect within this site: a path starting with exactly one "/". */
function safePath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/account";
}

// Handles both Supabase email-link flows so sign-in works without custom templates:
//   * PKCE code exchange — what Supabase's DEFAULT email templates send
//   * token_hash verify  — what you get if you customise the email templates
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safePath(searchParams.get("next"));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
