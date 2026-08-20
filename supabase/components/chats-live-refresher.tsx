"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Keeps the Courtside list truthful without moving its logic client-side:
 *  every trigger re-runs the server component (grouping, expiry, counts, the
 *  header pill — everything updates together).
 *  Triggers: mount (defeats the back/forward router-cache snapshot), tab
 *  focus/visibility, and realtime — a message landing in any of my
 *  conversations, or me joining a new match. */
export function ChatsLiveRefresher({ conversationIds, userId }: { conversationIds: string[]; userId: string }) {
  const router = useRouter();
  const lastRef = useRef(0);

  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      if (now - lastRef.current < 1200) return;
      lastRef.current = now;
      router.refresh();
    };

    // Back/forward navigation restores a cached snapshot by design — refetch once.
    refresh();

    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    const supabase = createClient();
    const channel = supabase.channel(`courtside-live:${Math.random().toString(36).slice(2)}`);
    if (conversationIds.length > 0) {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=in.(${conversationIds.join(",")})` },
        refresh,
      );
    }
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "match_participants", filter: `user_id=eq.${userId}` },
      refresh,
    );
    channel.subscribe();

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationIds.join("|"), userId]);

  return null;
}
