"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { QSessionState } from "@/lib/queue";

const DYNAMIC_TABLES = ["queue_teams", "queue_matches", "queue_team_members", "queue_courts", "queue_join_requests"];

/**
 * Live session state. Primary path is Supabase realtime (postgres_changes on the
 * dynamic tables, filtered by session_id) for near-instant updates; a short poll runs
 * as a safety net and to catch session-level changes (start/end) that aren't streamed.
 * If realtime isn't enabled for these tables, the poll alone still keeps it live.
 */
export function useQueueState(sessionId: string, initial: QSessionState, pollMs = 3000) {
  const [state, setState] = useState(initial);
  // K2-02: the server answers an unchanged session with 304 and no body, so a
  // quiet venue costs one cheap query per poll instead of a full snapshot.
  const etagRef = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const headers: HeadersInit = {};
      if (etagRef.current) headers["If-None-Match"] = etagRef.current;
      const r = await fetch(`/api/queue/${sessionId}`, { cache: "no-store", headers });
      if (r.status === 304) return; // unchanged — keep the state we have
      if (r.ok) {
        etagRef.current = r.headers.get("etag");
        setState(await r.json());
      }
    } catch {
      /* keep last good state */
    }
  }, [sessionId]);

  useEffect(() => {
    let alive = true;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const ping = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (alive) void refetch();
      }, 150);
    };

    const supabase = createClient();
    const channel = supabase.channel(`queue-${sessionId}`);
    for (const table of DYNAMIC_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `session_id=eq.${sessionId}` }, ping);
    }
    channel.subscribe();

    const poll = setInterval(() => {
      if (alive) void refetch();
    }, pollMs);

    return () => {
      alive = false;
      if (debounce) clearTimeout(debounce);
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [sessionId, pollMs, refetch]);

  return { state, setState, refetch };
}
