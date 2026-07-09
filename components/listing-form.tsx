"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { Camera, GripVertical, X, ShieldCheck, MapPin, Check } from "lucide-react";
import { SPORTS, sportMeta } from "@/lib/sports";
import { CATEGORIES, CONDITIONS } from "@/lib/marketplace";
import {
  createListing,
  updateListing,
  resolvePickupZip,
  nearbyCourtsForZip,
  type NearbyCourt,
} from "@/app/marketplace/listing-actions";

type PhotoItem = { key: string; token: string; url: string; file?: File };

export type ListingInitial = {
  id: string;
  title: string;
  category: string;
  sport: string;
  condition: string;
  mode: "sale" | "trade" | "free";
  price: string;
  obo: boolean;
  tradeWants: string;
  description: string;
  zip: string;
  locationLabel: string;
  meetCourtIds: string[];
  photos: { path: string; url: string }[];
};

const field =
  "h-[40px] w-full rounded-[10px] border border-rule-2 bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15";
const monoKicker = "font-mono text-[9.5px] font-bold uppercase tracking-[.18em] text-faint";

export function ListingForm({ formMode, initial, defaultZip }: { formMode: "create" | "edit"; initial?: ListingInitial; defaultZip?: string | null }) {
  const [state, formAction, pending] = useActionState(formMode === "create" ? createListing : updateListing, null);

  // ── photos ─────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<PhotoItem[]>(
    (initial?.photos ?? []).map((p) => ({ key: p.path, token: `e:${p.path}`, url: p.url })),
  );
  const newIdx = useRef(0);
  const dragFrom = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const room = 5 - photos.length;
    const files = Array.from(list).slice(0, Math.max(0, room));
    setPhotos((cur) => [
      ...cur,
      ...files.map((f) => {
        const i = newIdx.current++;
        return { key: `new-${i}`, token: `n:${i}`, url: URL.createObjectURL(f), file: f };
      }),
    ]);
  };
  const removePhoto = (key: string) => setPhotos((cur) => cur.filter((p) => p.key !== key));
  const onDrop = (to: number) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === to) return;
    setPhotos((cur) => {
      const next = [...cur];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  };
  const newFiles = useMemo(() => photos.filter((p) => p.file), [photos]);

  // ── mode / price ───────────────────────────────────────────────────
  const [mode, setMode] = useState<"sale" | "trade" | "free">(initial?.mode ?? "sale");

  // ── pickup area + meet spots ───────────────────────────────────────
  const [zip, setZip] = useState(initial?.zip ?? defaultZip ?? "");
  const [areaLabel, setAreaLabel] = useState<string | null>(initial?.locationLabel || null);
  const [areaErr, setAreaErr] = useState<string | null>(null);
  const [areaBusy, setAreaBusy] = useState(false);
  const [courts, setCourts] = useState<NearbyCourt[]>([]);
  const [meetIds, setMeetIds] = useState<string[]>(initial?.meetCourtIds ?? []);

  const resolveArea = async () => {
    if (areaBusy) return;
    setAreaBusy(true);
    setAreaErr(null);
    try {
      const r = await resolvePickupZip(zip);
      if ("error" in r) {
        setAreaLabel(null);
        setCourts([]);
        setAreaErr(r.error);
      } else {
        setAreaLabel(r.label);
        setCourts(await nearbyCourtsForZip(r.zip));
      }
    } finally {
      setAreaBusy(false);
    }
  };
  const toggleMeet = (id: string) =>
    setMeetIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id]));

  // Client appends File objects in on-screen order so `n:` indexes line up.
  const submit = (formData: FormData) => {
    formData.delete("photos");
    let n = 0;
    const tokens: string[] = [];
    for (const p of photos) {
      if (p.file) {
        formData.append("photos", p.file);
        tokens.push(`n:${n++}`);
      } else {
        tokens.push(p.token);
      }
    }
    formData.set("photo_order", tokens.join(","));
    formAction(formData);
  };

  return (
    <form action={submit} className="space-y-6">
      {initial ? <input type="hidden" name="listing_id" value={initial.id} /> : null}
      <input type="hidden" name="zip" value={areaLabel ? zip.trim() : ""} />
      <input type="hidden" name="location_label" value={areaLabel ?? ""} />
      {meetIds.map((id) => (
        <input key={id} type="hidden" name="meet_court_ids" value={id} />
      ))}

      {/* ── photos ── */}
      <section className="rounded-[18px] border border-rule bg-surface p-5 shadow-e1">
        <p className={monoKicker}>Photos · up to 5 · first is the cover</p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          {photos.map((p, i) => (
            <div
              key={p.key}
              draggable
              onDragStart={() => (dragFrom.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              className="group relative h-[96px] w-[128px] cursor-grab overflow-hidden rounded-[12px] border border-rule active:cursor-grabbing"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              {i === 0 ? (
                <span className="absolute left-1.5 top-1.5 rounded-[5px] bg-tint-brand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[.1em] text-flame-text" style={{ boxShadow: "inset 0 0 0 1px var(--color-tint-brand-bd)" }}>
                  Cover
                </span>
              ) : null}
              <span className="absolute bottom-1 left-1 text-white/90 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
                <GripVertical size={14} />
              </span>
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => removePhoto(p.key)}
                className="press absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full border border-rule bg-white/95 text-ink"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {photos.length < 5 ? (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="press grid h-[96px] w-[128px] place-items-center rounded-[12px] border-2 border-dashed border-rule-2 text-mute transition-colors hover:border-rule-hover hover:text-ink"
            >
              <span className="grid place-items-center gap-1 text-[11px] font-semibold">
                <Camera size={18} />
                Add photos
              </span>
            </button>
          ) : null}
        </div>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => addFiles(e.target.files)} />
        <p className="mt-2 text-[11px] text-faint">Drag to reorder. No photo? Buyers see a sport-tinted tile instead.</p>
        {newFiles.length > 0 ? <p className="mt-1 text-[11px] text-faint">{newFiles.length} new {newFiles.length === 1 ? "photo" : "photos"} will upload on save.</p> : null}
      </section>

      {/* ── basics ── */}
      <section className="rounded-[18px] border border-rule bg-surface p-5 shadow-e1">
        <p className={monoKicker}>The gear</p>
        <div className="mt-3 grid gap-3.5">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-ink-soft">Title</span>
            <input name="title" defaultValue={initial?.title} required minLength={4} maxLength={90} placeholder="Wilson Pro Staff 97, grip 4 3/8" className={field} />
          </label>
          <div className="grid gap-3.5 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-ink-soft">Category</span>
              <select name="category" defaultValue={initial?.category ?? "racquets"} className={field}>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-ink-soft">Sport</span>
              <select name="sport" defaultValue={initial?.sport ?? "multi"} className={field}>
                {SPORTS.map((s) => (
                  <option key={s.key} value={s.key}>{sportMeta(s.key).emoji} {s.name}</option>
                ))}
                <option value="multi">🏅 Multi-sport</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-ink-soft">Condition</span>
              <select name="condition" defaultValue={initial?.condition ?? "Good"} className={field}>
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-ink-soft">Description</span>
            <textarea name="description" defaultValue={initial?.description} maxLength={1200} rows={4} placeholder="A sentence or three — honest condition notes sell gear faster." className="w-full rounded-[10px] border border-rule-2 bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15" />
          </label>
        </div>
      </section>

      {/* ── mode + price ── */}
      <section className="rounded-[18px] border border-rule bg-surface p-5 shadow-e1">
        <p className={monoKicker}>How it changes hands</p>
        <input type="hidden" name="mode" value={mode} />
        <div className="mt-3 flex gap-0.5 rounded-[11px] p-[3px] sm:max-w-sm" style={{ background: "rgba(32,27,18,.05)" }}>
          {([
            { v: "sale", label: "Sell" },
            { v: "trade", label: "Trade" },
            { v: "free", label: "Give away" },
          ] as const).map((m) => (
            <button
              key={m.v}
              type="button"
              onClick={() => setMode(m.v)}
              className={`h-8 flex-1 rounded-lg text-xs font-semibold transition-colors ${mode === m.v ? "border border-rule-2 bg-white text-ink shadow-[0_1px_2px_rgba(80,60,30,.08)]" : "text-mute"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === "sale" ? (
          <div className="mt-3.5 flex flex-wrap items-end gap-4">
            <label className="block w-40">
              <span className="mb-1 block text-[12px] font-semibold text-ink-soft">Price (USD)</span>
              <input name="price" defaultValue={initial?.price} inputMode="decimal" placeholder="120" required className={field} />
            </label>
            <label className="flex h-[40px] items-center gap-2 text-[13px] font-semibold text-ink-soft">
              <input type="checkbox" name="obo" defaultChecked={initial?.obo} className="h-4 w-4 accent-[#E23E0D]" /> Or best offer
            </label>
          </div>
        ) : null}
        {mode === "trade" ? (
          <label className="mt-3.5 block sm:max-w-md">
            <span className="mb-1 block text-[12px] font-semibold text-ink-soft">Looking to trade for</span>
            <input name="trade_wants" defaultValue={initial?.tradeWants} required maxLength={120} placeholder="A pickleball paddle, mid-weight" className={field} />
          </label>
        ) : null}
        {mode === "free" ? <p className="mt-3 text-[12.5px] text-mute">Nice. It&rsquo;ll wear the green FREE badge.</p> : null}
      </section>

      {/* ── pickup area + meet spots ── */}
      <section className="rounded-[18px] border border-rule bg-surface p-5 shadow-e1">
        <p className={monoKicker}>Pickup area</p>
        <p className="mt-1.5 text-[12px] text-mute">Neighborhood-level only — your exact address is never shown.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={zip}
            onChange={(e) => {
              setZip(e.target.value);
              setAreaLabel(null);
            }}
            inputMode="numeric"
            maxLength={5}
            placeholder="ZIP"
            aria-label="Pickup ZIP"
            className={`${field} w-28`}
          />
          <button type="button" onClick={resolveArea} disabled={areaBusy || !/^\d{5}$/.test(zip.trim())} className="press h-[40px] rounded-[10px] border border-rule-2 bg-surface px-3.5 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-50">
            {areaBusy ? "Checking…" : "Set area"}
          </button>
          {areaLabel ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-tint-brand-bd bg-tint-brand px-3 py-1.5 text-[12px] font-semibold text-flame-text">
              <MapPin size={13} /> {areaLabel}
            </span>
          ) : null}
        </div>
        {areaErr ? <p className="mt-2 text-[12px] text-danger">{areaErr}</p> : null}
        {areaLabel && courts.length > 0 ? (
          <div className="mt-4">
            <p className={monoKicker}>Suggested meet spots · pick up to 3</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {courts.map((c) => {
                const on = meetIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleMeet(c.id)}
                    className={`flex h-[40px] items-center gap-2 rounded-[10px] border px-3 text-left text-[12.5px] font-semibold transition-colors ${on ? "border-tint-brand-bd bg-tint-brand text-flame-text" : "border-rule bg-surface text-ink-soft hover:text-ink"}`}
                  >
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border ${on ? "border-brand bg-brand text-white" : "border-rule-2"}`}>{on ? <Check size={11} /> : null}</span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="shrink-0 font-mono text-[10px] font-bold text-faint">{c.distanceMi} mi</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {/* ── terms ── */}
      <section className="flex items-start gap-2.5 rounded-[16px] p-4" style={{ background: "#FDFBF7", border: "1px solid #EFE9DC" }}>
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
        <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-mute">
          <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 shrink-0 accent-[#E23E0D]" />
          <span>
            I&rsquo;ll meet at a court or public place, this listing contains no prohibited items (weapons, counterfeits,
            recalled gear, non-sporting goods), and I understand Klimr is a venue only — it never processes payments
            and isn&rsquo;t a party to the sale.
          </span>
        </label>
      </section>

      {state?.error ? <p className="text-[13px] font-semibold text-danger">{state.error}</p> : null}

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="submit"
          disabled={pending}
          className="press inline-flex h-[40px] items-center rounded-[11px] px-5 text-[13.5px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06] disabled:opacity-60"
          style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
        >
          {pending ? "Saving…" : formMode === "create" ? "Publish listing" : "Save changes"}
        </button>
        {formMode === "create" ? (
          <button type="submit" name="intent" value="draft" disabled={pending} className="press h-[40px] rounded-[11px] border border-rule-2 bg-surface px-4 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-60">
            Save as draft
          </button>
        ) : null}
      </div>
    </form>
  );
}
