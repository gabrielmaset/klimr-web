"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Copy, Check, Tv, ListOrdered, Settings2, Power } from "lucide-react";
import { setQueueEnabled, startEventQueue } from "@/app/events/actions";

type Session = { id: string; code: string; status: string; firstCourtId: string | null };

export function EventQueueAdmin({ eventId, queueEnabled, session }: { eventId: string; queueEnabled: boolean; session: Session | null }) {
  const [pending, start] = useTransition();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  const toggle = () =>
    start(async () => {
      const fd = new FormData();
      fd.append("eventId", eventId);
      if (!queueEnabled) fd.append("enabled", "1");
      await setQueueEnabled(fd);
    });

  const copy = (key: string, url: string) => {
    navigator.clipboard?.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const walkUrl = origin && session ? `${origin}/q/${session.code}` : "";
  const courtsideUrl = origin && session && session.firstCourtId ? `${origin}/q/${session.code}/1` : "";

  return (
    <div className="rounded-3xl border border-rail-border bg-gradient-to-br from-[#0e2c3a] to-[#0a212c] p-5 text-white">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="kicker text-white/55">Live queue · admin</p>
          <p className="text-sm font-semibold">
            {!queueEnabled
              ? "Live queue is off"
              : session?.status === "live"
                ? "Live queue is running"
                : session?.status === "ended"
                  ? "Queue ended — ready for the next session"
                  : session
                    ? "Queue is set up — not started"
                    : "Live queue is on for this event"}
          </p>
        </div>
        <button type="button" onClick={toggle} disabled={pending} className="press inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-60">
          <Power size={13} /> {queueEnabled ? "Turn off" : "Turn on"}
        </button>
      </div>

      {queueEnabled ? (
        <div className="mt-4 space-y-2.5">
          {!session ? (
            <Link href={`/queue/new?event=${eventId}`} className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-deep">
              <Settings2 size={15} /> Set up the courts
            </Link>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {session.status === "ended" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const fd = new FormData();
                        fd.append("eventId", eventId);
                        await startEventQueue(fd);
                      })
                    }
                    className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:opacity-60"
                  >
                    <Power size={15} /> Start today&apos;s queue
                  </button>
                ) : null}
                <Link href={`/queue/${session.id}`} className={`press inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${session.status === "ended" ? "border border-white/20 text-white hover:bg-white/10" : "bg-brand text-white hover:bg-brand-deep"}`}>
                  <ListOrdered size={15} /> {session.status === "live" ? "Manage the live queue" : "Open queue setup"}
                </Link>
                {courtsideUrl ? (
                  <a href={courtsideUrl} target="_blank" rel="noreferrer" className="press inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
                    <Tv size={15} /> Open Courtside display
                  </a>
                ) : null}
              </div>
              <div className="grid gap-1.5 text-xs sm:grid-cols-2">
                {courtsideUrl ? (
                  <button type="button" onClick={() => copy("court", courtsideUrl)} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-left text-white/80 transition hover:bg-white/10">
                    {copied === "court" ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                    <span className="truncate">Courtside screen: {courtsideUrl.replace(/^https?:\/\//, "")}</span>
                  </button>
                ) : null}
                <button type="button" onClick={() => copy("walk", walkUrl)} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-left text-white/80 transition hover:bg-white/10">
                  {copied === "walk" ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                  <span className="truncate">Walk-up join: {walkUrl.replace(/^https?:\/\//, "")}</span>
                </button>
              </div>
              {!session.firstCourtId ? <p className="text-xs text-white/55">Add a court inside the queue to get a Courtside screen link for the tablet at the net.</p> : null}
            </>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-white/55">Turn this on to run a King-of-the-Court pickup line at this event — players join from their phones and a Courtside screen runs the net.</p>
      )}
    </div>
  );
}
