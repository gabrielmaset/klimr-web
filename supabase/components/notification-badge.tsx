"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CountBadge } from "@/components/count-badge";

/** Live unread-notifications bubble. The static count comes from the layout,
 *  which never re-renders on navigation — this keeps it honest: refetches on
 *  route change and window focus, and subscribes to the user's notification
 *  inserts/updates so reading them clears the badge everywhere at once. */
export function NotificationBadge({ initialCount, className = "" }: { initialCount: number; className?: string }) {
  const [count, setCount] = useState(initialCount);
  const pathname = usePathname();

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { count: n } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);
    setCount(n ?? 0);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void refetch(), 0);
    return () => clearTimeout(t);
  }, [pathname, refetch]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      channel = supabase
        .channel(`notif-badge:${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => void refetch())
        .subscribe();
    })();
    const onFocus = () => void refetch();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refetch]);

  return <CountBadge count={count} className={className} />;
}
