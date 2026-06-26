import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /settings/export — a portable JSON copy of the signed-in user's own data.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const [{ data: profile }, { data: sports }, { data: posts }, { data: prefs }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("player_sports").select("*").eq("user_id", user.id),
    supabase.from("posts").select("id, body, sport_key, created_at").eq("author_id", user.id),
    supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    profile,
    sports,
    posts,
    preferences: prefs,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="klimr-data.json"',
      "cache-control": "no-store",
    },
  });
}
