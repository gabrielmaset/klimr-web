"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, CircleAlert, ImagePlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SPORTS } from "@/lib/sports";
import { MediaCropper, type MediaCropResult } from "@/components/media-cropper";
import { createEvent, updateEvent, createEventCoverUploadUrl, setEventCover } from "@/app/events/actions";

const COVER_BUCKET = "tournament-gallery";
const field = "w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute";

const KINDS = [
  ["open_play", "Open play"],
  ["ladder", "Ladder night"],
  ["clinic", "Clinic"],
  ["tournament", "Round-robin / tournament"],
  ["social", "Social"],
] as const;

type Initial = {
  id: string;
  title: string;
  sport_key: string;
  kind: string;
  description: string | null;
  location_text: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  cost_text: string | null;
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const toIso = (local: string) => (local ? new Date(local).toISOString() : "");

export function EventForm({ initial }: { initial?: Initial }) {
  const router = useRouter();
  const editing = !!initial;
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [sportKey, setSportKey] = useState(initial?.sport_key ?? SPORTS[0].key);
  const [kind, setKind] = useState(initial?.kind ?? "open_play");
  const [startsLocal, setStartsLocal] = useState(() => toLocalInput(initial?.starts_at ?? null));
  const [endsLocal, setEndsLocal] = useState(() => toLocalInput(initial?.ends_at ?? null));
  const [location, setLocation] = useState(initial?.location_text ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity != null ? String(initial.capacity) : "");
  const [cost, setCost] = useState(initial?.cost_text ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  const [cover, setCover] = useState<MediaCropResult | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null);
    if (!f.type.startsWith("image/")) return setErr("Please choose an image.");
    if (f.size > 12 * 1024 * 1024) return setErr("Image must be under 12 MB.");
    setCropSrc(URL.createObjectURL(f));
  }

  async function submit() {
    setErr(null);
    if (!title.trim()) return setErr("Add a title.");
    if (!startsLocal) return setErr("Pick a date and time.");
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        sport_key: sportKey,
        kind,
        description: description.trim() || null,
        location_text: location.trim() || null,
        starts_at: toIso(startsLocal),
        ends_at: endsLocal ? toIso(endsLocal) : null,
        capacity: capacity ? Number(capacity) : null,
        cost_text: cost.trim() || null,
      };

      if (initial) {
        const res = await updateEvent(initial.id, payload);
        if (!res.ok) return setErr(res.error ?? "Couldn't save.");
        router.push(`/events/${initial.id}`);
        router.refresh();
        return;
      }

      const res = await createEvent(payload);
      if (!res.ok) return setErr(res.error ?? "Couldn't create the event.");
      if (cover) {
        const supabase = createClient();
        const signed = await createEventCoverUploadUrl(res.id, cover.type);
        if (signed.ok) {
          const up = await supabase.storage.from(COVER_BUCKET).uploadToSignedUrl(signed.path, signed.token, cover.blob, { contentType: cover.type });
          if (!up.error) await setEventCover(res.id, signed.path);
        }
      }
      router.push(`/events/${res.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-rule bg-surface p-5">
        <label className="block">
          <span className={labelCls}>Event name</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="e.g. Saturday Pickleball Open Play" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Sport</span>
            <select className={field} value={sportKey} onChange={(e) => setSportKey(e.target.value)}>
              {SPORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.emoji} {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Type</span>
            <select className={field} value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={labelCls}>Description</span>
          <textarea className={field} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="What to expect, level, what to bring…" />
        </label>
      </section>

      <section className="space-y-4 rounded-2xl border border-rule bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">When &amp; where</h2>
        <p className="-mt-2 text-xs text-faint">Times are Pacific.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Starts</span>
            <input type="datetime-local" className={field} value={startsLocal} onChange={(e) => setStartsLocal(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelCls}>Ends (optional)</span>
            <input type="datetime-local" className={field} value={endsLocal} onChange={(e) => setEndsLocal(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className={labelCls}>Venue / location</span>
          <input className={field} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="e.g. Memorial Park Courts, 1401 Olympic Blvd" />
        </label>
      </section>

      <section className="space-y-4 rounded-2xl border border-rule bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">Spots &amp; cost</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Capacity (optional)</span>
            <input type="number" min={1} className={field} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="e.g. 16" />
          </label>
          <label className="block">
            <span className={labelCls}>Cost</span>
            <input className={field} value={cost} onChange={(e) => setCost(e.target.value)} maxLength={60} placeholder="Free, or e.g. $15 drop-in" />
          </label>
        </div>
      </section>

      {!editing ? (
        <section className="space-y-3 rounded-2xl border border-rule bg-surface p-5">
          <h2 className="text-sm font-bold text-ink">Cover photo (optional)</h2>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickCover} />
          {cover ? (
            <div className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-2xl border border-rule">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover.dataUrl} alt="Cover preview" className="h-full w-full object-cover" />
              <button type="button" onClick={() => setCover(null)} aria-label="Remove cover" className="press absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} className="press inline-flex items-center gap-1.5 rounded-xl border border-dashed border-rule px-4 py-2.5 text-sm font-semibold text-mute hover:border-brand hover:text-brand-deep">
              <ImagePlus size={16} /> Add a square cover photo
            </button>
          )}
          <p className="text-xs text-faint">A photo of the venue or a past session makes your event stand out. You can also add or change it later.</p>
        </section>
      ) : null}

      {err ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-deep">
          <CircleAlert size={14} /> {err}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="button" onClick={submit} disabled={busy} className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {editing ? "Save changes" : "Publish event"}
        </button>
        <button type="button" onClick={() => router.back()} className="press text-sm font-semibold text-mute hover:text-ink">
          Cancel
        </button>
      </div>

      {cropSrc ? (
        <MediaCropper
          src={cropSrc}
          aspect={1}
          outputW={900}
          title="Position your cover photo"
          onCancel={() => setCropSrc(null)}
          onConfirm={(r) => {
            setCover(r);
            setCropSrc(null);
          }}
        />
      ) : null}
    </div>
  );
}
