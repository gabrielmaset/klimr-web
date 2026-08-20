import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatRoom } from "./room";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/chats/${matchId}`);

  // Only match participants may open the chat.
  const { data: mine } = await supabase
    .from("match_participants")
    .select("match_id")
    .eq("match_id", matchId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!mine) redirect("/chats");

  const { data: match } = await supabase
    .from("matches")
    .select("id, sport_key, format, scheduled_at, location_text")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) redirect("/chats");

  const { data: parts } = await supabase.from("match_participants").select("user_id").eq("match_id", matchId);
  const ids = (parts ?? []).map((p) => p.user_id);
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_hue, avatar_path")
    .in("id", ids.length ? ids : [user.id]);

  const participants = (profs ?? []).map((p) => ({
    id: p.id,
    name: p.display_name || "Player",
    hue: p.avatar_hue ?? 200,
    avatarUrl: p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null,
  }));

  // Match chats are ephemeral: usable until 24h after the match start.
  const expiresAt = match.scheduled_at
    ? new Date(new Date(match.scheduled_at).getTime() + 24 * 3_600_000).toISOString()
    : null;

  return <ChatRoom meId={user.id} match={match} participants={participants} expiresAt={expiresAt} />;
}
