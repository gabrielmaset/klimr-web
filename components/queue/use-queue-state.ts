"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { QSessionState } from "@/lib/queue";
import { getInstallId, peekDeviceToken } from "@/lib/courtside-install";

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
      const headers: Record<string, string> = {};
      if (etagRef.current) headers["If-None-Match"] = etagRef.current;
      // KCDX-008: a registered Courtside display identifies itself so the server
      // can decide whether it is an operator. Ordinary browsers send nothing and
      // get the ordinary projection; presenting a token proves nothing unless the
      // database agrees it is live and bound to this session.
      const deviceToken = peekDeviceToken();
      const installId = deviceToken ? getInstallId() : null;
      if (installId && deviceToken) {
        headers["x-klimr-install"] = installId;
        headers["x-klimr-device-token"] = deviceToken;
      }
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

    // KCDX-002: this used to subscribe to postgres_changes on the five queue
    // tables. Realtime publishes whole rows, and those rows ARE the presence
    // data — who is on which court, right now — so the subscription was a live
    // feed of it to anyone holding the public anon key. Migration 0192 removes
    // the tables from the publication; the polling path below already existed
    // and carries the whole load, at the cost of at most one interval of
    // latency. `ping` stays for the debounce it shares with refetch.
    void ping;

    const poll = setInterval(() => {
      if (alive) void refetch();
    }, pollMs);

    return () => {
      alive = false;
      if (debounce) clearTimeout(debounce);
      clearInterval(poll);
    };
  }, [sessionId, pollMs, refetch]);

  return { state, setState, refetch };
}
