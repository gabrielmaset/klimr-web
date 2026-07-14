"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Realtime "New updates" pill — the feed never jank-inserts while someone
 *  reads; new items arrive on tap (chats-live-refresher precedent). */
export function FeedLivePill() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const channel = supabase
      .channel("feed-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "feed_items" }, () => setCount((c) => c + 1))
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (count === 0) return null;
  return (
    <div className="sticky top-16 z-30 flex justify-center">
      <button
        type="button"
        onClick={() => {
          setCount(0);
          router.refresh();
        }}
        className="press inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white shadow-lg"
        style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
      >
        <ArrowUp size={13} /> {count} new {count === 1 ? "update" : "updates"}
      </button>
    </div>
  );
}
