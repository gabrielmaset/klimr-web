import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DmRoom } from "@/components/dm-room";

export default async function DmPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/messages/${conversationId}`);

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, kind, created_by, peer_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.kind !== "dm") notFound();
  if (user.id !== conv.created_by && user.id !== conv.peer_id) notFound();

  const peerId = user.id === conv.created_by ? conv.peer_id! : conv.created_by!;
  const { data: peer } = await supabase.from("profiles").select("id, display_name, avatar_hue").eq("id", peerId).maybeSingle();

  return <DmRoom convId={conv.id} meId={user.id} peer={{ id: peerId, name: peer?.display_name ?? "Member", hue: peer?.avatar_hue ?? 200 }} backHref="/health" />;
}
