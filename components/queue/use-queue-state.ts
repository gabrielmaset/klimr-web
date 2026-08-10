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
  // KCDX-042: the poll had no single-flight guard, no abort, no backoff, and no
  // visibility awareness — and it swallowed every failure, so a venue whose
  // network had dropped showed a confidently stale queue with no indication
  // anything was wrong. On a court that is the difference between "nobody is
  // ahead of me" and "the screen stopped updating twenty minutes ago".
  const inFlight = useRef<AbortController | null>(null);
  const failures = useRef(0);
  const [stale, setStale] = useState(false);

  const refetch = useCallback(async () => {
    // Single-flight: a slow request must not have three more stacked behind it,
    // each racing to set state in whatever order they happen to land.
    if (inFlight.current) inFlight.current.abort();
    const ctl = new AbortController();
    inFlight.current = ctl;
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
      const r = await fetch(`/api/queue/${sessionId}`, { cache: "no-store", headers, signal: ctl.signal });
      if (r.status === 304) {
        failures.current = 0;
        setStale(false);
        return; // unchanged — keep the state we have
      }
      if (r.ok) {
        etagRef.current = r.headers.get("etag");
        setState(await r.json());
        failures.current = 0;
        setStale(false);
      } else {
        failures.current += 1;
      }
    } catch (err) {
      // An abort is us superseding ourselves, not a failure.
      if (!(err instanceof DOMException && err.name === "AbortError")) failures.current += 1;
    } finally {
      if (inFlight.current === ctl) inFlight.current = null;
      // Two consecutive misses is roughly six seconds of silence — long enough
      // to mean something, short enough that the room finds out while it still
      // matters.
      if (failures.current >= 2) setStale(true);
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

    // Backoff with jitter on repeated failure, and nothing at all while the tab
    // is hidden: a courtside display left open overnight should not keep asking,
    // and a venue with flaky wifi should not have every client retrying in
    // lockstep the moment it returns.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      const backoff = Math.min(pollMs * 2 ** Math.min(failures.current, 4), 60_000);
      const base = failures.current === 0 ? pollMs : backoff;
      const jitter = failures.current === 0 ? 0 : base * 0.25 * Math.random();
      timer = setTimeout(async () => {
        if (!alive) return;
        if (typeof document === "undefined" || document.visibilityState === "visible") {
          await refetch();
        }
        schedule();
      }, base + jitter);
    };
    schedule();

    // Coming back to the tab should feel immediate, not "wait for the next tick".
    const onVisible = () => {
      if (document.visibilityState === "visible" && alive) void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      alive = false;
      if (debounce) clearTimeout(debounce);
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      inFlight.current?.abort();
    };
  }, [sessionId, pollMs, refetch]);

  return { state, setState, refetch, stale };
}
