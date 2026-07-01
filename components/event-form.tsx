"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, CircleAlert, ImagePlus, X, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SPORTS } from "@/lib/sports";
import { eventKindsFor } from "@/lib/event-kinds";
import { MediaCropper, type MediaCropResult } from "@/components/media-cropper";
import { RichTextEditor, linkifyHtml } from "@/components/rich-text-editor";
import { DateTimeField } from "@/components/date-time-field";
import {
  createEvent,
  updateEvent,
  createEventCoverUploadUrl,
  setEventCover,
  removeEventCover,
  createEventThumbUploadUrl,
  setEventThumb,
  removeEventThumb,
} from "@/app/events/actions";

const COVER_BUCKET = "tournament-gallery";
const field = "w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute";

const WEEKDAYS: [string, string][] = [
  ["SU", "Sun"],
  ["MO", "Mon"],
  ["TU", "Tue"],
  ["WE", "Wed"],
  ["TH", "Thu"],
  ["FR", "Fri"],
  ["SA", "Sat"],
];
const RECUR_OPTS: [string, string][] = [
  ["none", "One-time"],
  ["weekly", "Weekly"],
  ["biweekly", "Every 2 weeks"],
  ["monthly", "Monthly"],
  ["daily", "Daily"],
];

type Initial = {
  id: string;
  title: string;
  sport_key: string;
  kind: string;
  description: string | null;
  location_text: string | null;
  location_url: string | null;
  starts_at: string;
  ends_at: string | null;
  capacity: number | null;
  cost_text: string | null;
  whatsapp_url: string | null;
  join_policy: string;
  recurrence: string;
  recurrence_days: string[];
  queue_enabled: boolean;
  cover_url: string | null;
  thumb_url: string | null;
};

type ImgTarget = "banner" | "thumb";

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
  const bannerFileRef = useRef<HTMLInputElement | null>(null);
  const thumbFileRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [sportKey, setSportKey] = useState(initial?.sport_key ?? SPORTS[0].key);
  const [kind, setKind] = useState(initial?.kind ?? "open_play");
  const [startsLocal, setStartsLocal] = useState(() => toLocalInput(initial?.starts_at ?? null));
  const [endsLocal, setEndsLocal] = useState(() => toLocalInput(initial?.ends_at ?? null));
  const [location, setLocation] = useState(initial?.location_text ?? "");
  const [locationUrl, setLocationUrl] = useState(initial?.location_url ?? "");
  const [capacity, setCapacity] = useState(initial?.capacity != null ? String(initial.capacity) : "");
  const [cost, setCost] = useState(initial?.cost_text ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp_url ?? "");
  const [joinPolicy, setJoinPolicy] = useState(initial?.join_policy === "approval" ? "approval" : "open");
  const [recurrence, setRecurrence] = useState(initial?.recurrence ?? "none");
  const [recurDays, setRecurDays] = useState<string[]>(initial?.recurrence_days ?? []);
  const [queueEnabled, setQueueEnabled] = useState(!!initial?.queue_enabled);
  const toggleDay = (d: string) => setRecurDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));
  const showDays = recurrence === "weekly" || recurrence === "biweekly";

  const [bannerUrl, setBannerUrl] = useState<string | null>(initial?.cover_url ?? null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(initial?.thumb_url ?? null);
  const [bannerStaged, setBannerStaged] = useState<MediaCropResult | null>(null);
  const [thumbStaged, setThumbStaged] = useState<MediaCropResult | null>(null);
  const [cropTarget, setCropTarget] = useState<ImgTarget | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function pickImage(target: ImgTarget, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null);
    if (!f.type.startsWith("image/")) return setErr("Please choose an image.");
    if (f.size > 12 * 1024 * 1024) return setErr("Image must be under 12 MB.");
    setCropTarget(target);
    setCropSrc(URL.createObjectURL(f));
  }

  async function onCropConfirm(res: MediaCropResult) {
    const target = cropTarget;
    setCropSrc(null);
    setCropTarget(null);
    if (!target) return;
    if (editing && initial) {
      setImgBusy(true);
      try {
        const supabase = createClient();
        if (target === "banner") {
          const signed = await createEventCoverUploadUrl(initial.id, res.type);
          if (signed.ok) {
            const up = await supabase.storage.from(COVER_BUCKET).uploadToSignedUrl(signed.path, signed.token, res.blob, { contentType: res.type });
            if (!up.error) {
              const saved = await setEventCover(initial.id, signed.path);
              if (saved.ok) setBannerUrl(saved.url);
            }
          }
        } else {
          const signed = await createEventThumbUploadUrl(initial.id, res.type);
          if (signed.ok) {
            const up = await supabase.storage.from(COVER_BUCKET).uploadToSignedUrl(signed.path, signed.token, res.blob, { contentType: res.type });
            if (!up.error) {
              const saved = await setEventThumb(initial.id, signed.path);
              if (saved.ok) setThumbUrl(saved.url);
            }
          }
        }
      } finally {
        setImgBusy(false);
      }
    } else if (target === "banner") {
      setBannerStaged(res);
      setBannerUrl(res.dataUrl);
    } else {
      setThumbStaged(res);
      setThumbUrl(res.dataUrl);
    }
  }

  async function removeImage(target: ImgTarget) {
    if (editing && initial) {
      setImgBusy(true);
      try {
        if (target === "banner") {
          await removeEventCover(initial.id);
          setBannerUrl(null);
        } else {
          await removeEventThumb(initial.id);
          setThumbUrl(null);
        }
      } finally {
        setImgBusy(false);
      }
    } else if (target === "banner") {
      setBannerStaged(null);
      setBannerUrl(null);
    } else {
      setThumbStaged(null);
      setThumbUrl(null);
    }
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
        description: linkifyHtml(description),
        location_text: location.trim() || null,
        location_url: locationUrl.trim() || null,
        starts_at: toIso(startsLocal),
        ends_at: endsLocal ? toIso(endsLocal) : null,
        capacity: capacity ? Number(capacity) : null,
        cost_text: cost.trim() || null,
        whatsapp_url: whatsapp.trim() || null,
        join_policy: joinPolicy,
        recurrence,
        recurrence_days: showDays ? recurDays : [],
        queue_enabled: queueEnabled,
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
      const supabase = createClient();
      if (bannerStaged) {
        const signed = await createEventCoverUploadUrl(res.id, bannerStaged.type);
        if (signed.ok) {
          const up = await supabase.storage.from(COVER_BUCKET).uploadToSignedUrl(signed.path, signed.token, bannerStaged.blob, { contentType: bannerStaged.type });
          if (!up.error) await setEventCover(res.id, signed.path);
        }
      }
      if (thumbStaged) {
        const signed = await createEventThumbUploadUrl(res.id, thumbStaged.type);
        if (signed.ok) {
          const up = await supabase.storage.from(COVER_BUCKET).uploadToSignedUrl(signed.path, signed.token, thumbStaged.blob, { contentType: thumbStaged.type });
          if (!up.error) await setEventThumb(res.id, signed.path);
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
            <select
              className={field}
              value={sportKey}
              onChange={(e) => {
                const s = e.target.value;
                setSportKey(s);
                const nk = eventKindsFor(s);
                if (!nk.some((k) => k.value === kind)) setKind(nk[0].value);
              }}
            >
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
              {eventKindsFor(sportKey).map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            {(() => {
              const sel = eventKindsFor(sportKey).find((k) => k.value === kind);
              return sel ? <span className="mt-1.5 block text-[11px] leading-relaxed text-faint">{sel.blurb}</span> : null;
            })()}
          </label>
        </div>
        <div>
          <span className={labelCls}>Description</span>
          <RichTextEditor value={description} onChange={setDescription} />
          <span className="mt-1.5 block text-[11px] text-faint">Format the text, add links, colours, and highlights. Pasted links become clickable automatically.</span>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-rule bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">When &amp; where</h2>
        <p className="-mt-2 text-xs text-faint">Times are Pacific.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className={labelCls}>Starts</span>
            <DateTimeField value={startsLocal} onChange={setStartsLocal} ariaLabel="Starts" />
          </div>
          <div>
            <span className={labelCls}>Ends (optional)</span>
            <DateTimeField value={endsLocal} onChange={setEndsLocal} optional ariaLabel="Ends" />
          </div>
        </div>
        <label className="block">
          <span className={labelCls}>Venue / location</span>
          <input className={field} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder="e.g. Memorial Park Courts, 1401 Olympic Blvd" />
        </label>
        <label className="block">
          <span className={labelCls}>Google Maps link (optional)</span>
          <div className="relative">
            <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input className={`${field} pl-9`} value={locationUrl} onChange={(e) => setLocationUrl(e.target.value)} maxLength={500} placeholder="Paste a Google Maps link for the exact spot" />
          </div>
          <span className="mt-1.5 block text-[11px] text-faint">When set, the location on the event page opens this exact pin. Otherwise it searches the venue text above.</span>
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

      <section className="space-y-4 rounded-2xl border border-rule bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">Group &amp; joining</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Repeats</span>
            <select className={field} value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              {RECUR_OPTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Who can join</span>
            <select className={field} value={joinPolicy} onChange={(e) => setJoinPolicy(e.target.value)}>
              <option value="open">Anyone can join</option>
              <option value="approval">Require admin approval</option>
            </select>
          </label>
        </div>

        {showDays ? (
          <div>
            <span className={labelCls}>On which days</span>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map(([code, lbl]) => {
                const on = recurDays.includes(code);
                return (
                  <button key={code} type="button" onClick={() => toggleDay(code)} className="press rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors" style={{ borderColor: on ? "#ff4e1b" : "#e4e4e7", background: on ? "#fff1ed" : "white", color: on ? "#d63a0f" : "#71717a" }}>
                    {lbl}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-faint">For weekly groups like a Tuesday beach-volley meetup. Leave empty to use the start day.</p>
          </div>
        ) : null}

        <label className="block">
          <span className={labelCls}>WhatsApp group link (optional)</span>
          <input className={field} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} maxLength={300} placeholder="https://chat.whatsapp.com/…" />
          <span className="mt-1.5 block text-[11px] text-faint">Shown to members who&apos;ve joined, so they can chat between sessions.</span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-rule bg-bg/50 p-3.5">
          <input type="checkbox" checked={queueEnabled} onChange={(e) => setQueueEnabled(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#ff4e1b]" />
          <span>
            <span className="block text-sm font-semibold text-ink">Enable the live queue (King of the Court)</span>
            <span className="mt-0.5 block text-xs text-mute">Run a self-managing pickup line on the day — winners stay, losers re-form. You&apos;ll set up the courts from the event page.</span>
          </span>
        </label>
      </section>

      <section className="space-y-4 rounded-2xl border border-rule bg-surface p-5">
        <div>
          <h2 className="text-sm font-bold text-ink">Photos</h2>
          <p className="text-xs text-faint">A wide banner runs across the top of the event page; a square image is used on event cards. {editing ? "Changes save right away." : "Both are optional."}</p>
        </div>
        <input ref={bannerFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage("banner", e)} />
        <input ref={thumbFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage("thumb", e)} />
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div>
            <span className={labelCls}>Top banner (16:9)</span>
            {bannerUrl ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-rule">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bannerUrl} alt="Banner preview" className="h-full w-full object-cover" />
                <div className="absolute right-2 top-2 flex gap-1.5">
                  <button type="button" onClick={() => bannerFileRef.current?.click()} disabled={imgBusy} className="press rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">Change</button>
                  <button type="button" onClick={() => removeImage("banner")} disabled={imgBusy} aria-label="Remove banner" className="press grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white backdrop-blur"><X size={12} /></button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => bannerFileRef.current?.click()} disabled={imgBusy} className="press flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-rule text-mute hover:border-brand hover:text-brand-deep">
                {imgBusy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                <span className="text-xs font-semibold">Add banner photo</span>
              </button>
            )}
          </div>
          <div>
            <span className={labelCls}>Card image (square)</span>
            {thumbUrl ? (
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-rule">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbUrl} alt="Card preview" className="h-full w-full object-cover" />
                <div className="absolute right-2 top-2 flex gap-1.5">
                  <button type="button" onClick={() => thumbFileRef.current?.click()} disabled={imgBusy} className="press rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">Change</button>
                  <button type="button" onClick={() => removeImage("thumb")} disabled={imgBusy} aria-label="Remove card image" className="press grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white backdrop-blur"><X size={12} /></button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => thumbFileRef.current?.click()} disabled={imgBusy} className="press flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-rule text-mute hover:border-brand hover:text-brand-deep">
                {imgBusy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                <span className="text-xs font-semibold">Add card image</span>
              </button>
            )}
          </div>
        </div>
      </section>

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
          aspect={cropTarget === "thumb" ? 1 : 16 / 9}
          outputW={cropTarget === "thumb" ? 600 : 1600}
          title={cropTarget === "thumb" ? "Position the card image" : "Position the banner"}
          onCancel={() => {
            setCropSrc(null);
            setCropTarget(null);
          }}
          onConfirm={onCropConfirm}
        />
      ) : null}
    </div>
  );
}
