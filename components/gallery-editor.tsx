"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2, CircleAlert, Crop, GripVertical } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createGalleryUploadUrl, commitGalleryPhoto, removeGalleryPhoto, setGalleryLayout } from "@/app/tournaments/actions";
import type { GalleryItem } from "@/lib/tournament";

const BUCKET = "tournament-gallery";
const MAX = 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Hero-photo manager: upload up to 10, drag to reorder (first leads the
 *  public page), and crop each non-destructively — the preview uses the exact
 *  CSS the hero uses, so what you frame here is what visitors see. */
export function GalleryEditor({ tournamentId, initial }: { tournamentId: string; initial: GalleryItem[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<GalleryItem[]>(initial);
  const [busy, setBusy] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cropIdx, setCropIdx] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const touch = (next: GalleryItem[]) => {
    setItems(next);
    setDirty(true);
    setSaved(false);
  };

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setErr(null);
    setBusy(true);
    const supabase = createClient();
    let added = [...items];
    try {
      for (const f of files) {
        if (added.length >= MAX) {
          setErr(`You can add up to ${MAX} photos.`);
          break;
        }
        if (!f.type.startsWith("image/")) {
          setErr("Some files were skipped — images only.");
          continue;
        }
        if (f.size > 8 * 1024 * 1024) {
          setErr("Each photo must be under 8 MB.");
          continue;
        }
        const signed = await createGalleryUploadUrl(tournamentId, f.type);
        if (!signed.ok) {
          setErr(signed.error ?? "Upload failed.");
          continue;
        }
        const up = await supabase.storage.from(BUCKET).uploadToSignedUrl(signed.path, signed.token, f, { contentType: f.type });
        if (up.error) {
          setErr(up.error.message);
          continue;
        }
        const committed = await commitGalleryPhoto(tournamentId, signed.path);
        if (!committed.ok) {
          setErr(committed.error ?? "Couldn't save the photo.");
          continue;
        }
        added = [...added, { url: committed.url, zoom: 1, x: 50, y: 50 }];
        setItems(added);
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeAt(i: number) {
    const target = items[i];
    if (!target) return;
    setErr(null);
    const res = await removeGalleryPhoto(tournamentId, target.url);
    if (!res.ok) {
      setErr(res.error ?? "Couldn't remove the photo.");
      return;
    }
    if (cropIdx === i) setCropIdx(null);
    setItems((cur) => cur.filter((_, j) => j !== i));
    router.refresh();
  }

  const onDrop = (to: number) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === to) return;
    const next = [...items];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    if (cropIdx !== null) setCropIdx(null);
    touch(next);
  };

  async function saveLayout() {
    setSavingLayout(true);
    setErr(null);
    const res = await setGalleryLayout(tournamentId, items);
    if (res.ok) {
      setDirty(false);
      setSaved(true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setSaved(false), 3000);
      router.refresh();
    } else {
      setErr(res.error ?? "Couldn't save the layout.");
    }
    setSavingLayout(false);
  }

  const cropping = cropIdx !== null ? items[cropIdx] : null;

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {items.map((g, i) => (
          <div
            key={g.url}
            draggable
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(i)}
            className={`group relative h-[92px] w-[130px] cursor-grab overflow-hidden rounded-xl border active:cursor-grabbing ${cropIdx === i ? "border-brand ring-2 ring-brand/25" : "border-rule"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={g.url}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: `${g.x}% ${g.y}%`, transform: `scale(${g.zoom})`, transformOrigin: `${g.x}% ${g.y}%` }}
            />
            {i === 0 ? (
              <span className="absolute left-1.5 top-1.5 rounded-[5px] bg-tint-brand px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[.1em] text-flame-text" style={{ boxShadow: "inset 0 0 0 1px var(--color-tint-brand-bd)" }}>
                Leads
              </span>
            ) : null}
            <span className="absolute bottom-1 left-1 text-white/90 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
              <GripVertical size={13} />
            </span>
            <div className="absolute right-1 top-1 flex gap-1">
              <button
                type="button"
                aria-label="Crop photo"
                onClick={() => setCropIdx(cropIdx === i ? null : i)}
                className="press grid h-6 w-6 place-items-center rounded-full border border-rule bg-white/95 text-ink"
              >
                <Crop size={11} />
              </button>
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => void removeAt(i)}
                className="press grid h-6 w-6 place-items-center rounded-full border border-rule bg-white/95 text-ink hover:text-danger"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))}
        {items.length < MAX ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="press grid h-[92px] w-[130px] place-items-center rounded-xl border-2 border-dashed border-rule-2 text-mute transition-colors hover:border-rule-hover hover:text-ink disabled:opacity-50"
          >
            <span className="grid place-items-center gap-1 text-[11px] font-semibold">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
              {busy ? "Uploading…" : "Add photos"}
            </span>
          </button>
        ) : null}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void pick(e)} />
      <p className="mt-2 text-[11px] text-faint">
        Up to {MAX} photos · drag to reorder — the first one leads the hero, and it rotates through the rest every few seconds.
      </p>

      {cropping ? (
        <div className="mt-4 rounded-2xl border border-rule bg-bg p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-faint">Crop — drag to frame, slide to zoom</p>
          <div
            className="mt-2 h-[190px] cursor-move touch-none overflow-hidden rounded-xl border border-rule"
            onPointerDown={(e) => {
              const el = e.currentTarget;
              el.setPointerCapture(e.pointerId);
              const start = { px: e.clientX, py: e.clientY, x: cropping.x, y: cropping.y };
              const rect = el.getBoundingClientRect();
              const move = (ev: PointerEvent) => {
                const nx = clamp(start.x - ((ev.clientX - start.px) / rect.width) * (100 / cropping.zoom), 0, 100);
                const ny = clamp(start.y - ((ev.clientY - start.py) / rect.height) * (100 / cropping.zoom), 0, 100);
                touch(items.map((it, j) => (j === cropIdx ? { ...it, x: Math.round(nx), y: Math.round(ny) } : it)));
              };
              const up = () => {
                el.removeEventListener("pointermove", move);
                el.removeEventListener("pointerup", up);
              };
              el.addEventListener("pointermove", move);
              el.addEventListener("pointerup", up);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cropping.url}
              alt=""
              draggable={false}
              className="h-full w-full select-none object-cover"
              style={{ objectPosition: `${cropping.x}% ${cropping.y}%`, transform: `scale(${cropping.zoom})`, transformOrigin: `${cropping.x}% ${cropping.y}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
              Zoom
              <input
                type="range"
                min={1}
                max={2.5}
                step={0.05}
                value={cropping.zoom}
                onChange={(e) => touch(items.map((it, j) => (j === cropIdx ? { ...it, zoom: parseFloat(e.target.value) } : it)))}
                className="w-40 accent-[#E23E0D]"
              />
            </label>
            <button
              type="button"
              onClick={() => touch(items.map((it, j) => (j === cropIdx ? { ...it, zoom: 1, x: 50, y: 50 } : it)))}
              className="press rounded-lg border border-rule-2 bg-surface px-2.5 py-1.5 text-xs font-semibold text-mute hover:text-ink"
            >
              Reset
            </button>
            <button type="button" onClick={() => setCropIdx(null)} className="press rounded-lg border border-rule-2 bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink">
              Done
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void saveLayout()}
          disabled={savingLayout || !dirty}
          className="press inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition hover:bg-ink-soft disabled:opacity-50"
        >
          {savingLayout ? <Loader2 size={15} className="animate-spin" /> : null} Save layout
        </button>
        {saved ? <span className="text-sm font-semibold text-success">Saved</span> : dirty ? <span className="text-xs text-faint">Unsaved order/crop changes</span> : null}
        {err ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-deep">
            <CircleAlert size={13} /> {err}
          </span>
        ) : null}
      </div>
    </div>
  );
}
