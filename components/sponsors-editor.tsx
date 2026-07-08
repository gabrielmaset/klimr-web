"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Trash2, Plus, ImagePlus, CircleAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createGalleryUploadUrl, saveSponsors } from "@/app/tournaments/actions";
import { MediaCropper, type MediaCropResult } from "@/components/media-cropper";
import type { Sponsor } from "@/lib/tournament";

const BUCKET = "tournament-gallery";
const MAX_SPONSORS = 40;
const MAX_PHOTOS = 1;

type Row = { id: string; name: string; url: string; tier: "premium" | "standard"; logo: string | null; photos: string[]; blurb: string };

function uid() {
  return `s_${Math.random().toString(36).slice(2, 10)}`;
}
function toRow(s: Sponsor): Row {
  return {
    id: s.id || uid(),
    name: s.name ?? "",
    url: s.url ?? "",
    tier: s.tier === "premium" ? "premium" : "standard",
    logo: s.logo ?? null,
    photos: Array.isArray(s.photos) ? s.photos : [],
    blurb: s.blurb ?? "",
  };
}

export function SponsorsEditor({ tournamentId, initial }: { tournamentId: string; initial: Sponsor[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial.map(toRow));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null); // sponsor id currently uploading
  // A file picked for logo or promo opens the cropper first; the cropped blob is
  // what actually uploads. objectURL is the local preview the cropper reads.
  const [crop, setCrop] = useState<{ id: string; kind: "logo" | "photo"; src: string } | null>(null);

  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  function add() {
    if (rows.length >= MAX_SPONSORS) return;
    setRows((rs) => [...rs, { id: uid(), name: "", url: "", tier: "standard", logo: null, photos: [], blurb: "" }]);
  }
  function remove(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  // Upload an already-cropped blob (or a raw file) to the gallery bucket.
  async function uploadBlob(blob: Blob, type: string): Promise<string | null> {
    const supabase = createClient();
    const signed = await createGalleryUploadUrl(tournamentId, type);
    if (!signed.ok) throw new Error(signed.error ?? "Upload failed.");
    const up = await supabase.storage.from(BUCKET).uploadToSignedUrl(signed.path, signed.token, blob, { contentType: type });
    if (up.error) throw new Error(up.error.message);
    return supabase.storage.from(BUCKET).getPublicUrl(signed.path).data.publicUrl;
  }

  // Pick a file → validate → open the cropper. Nothing uploads until the crop
  // is confirmed, so the organizer always controls framing.
  function pickFor(id: string, kind: "logo" | "photo", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setErr(null);
    if (!file.type.startsWith("image/")) {
      setErr("Images only (JPG, PNG, or WebP).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErr("Each image must be under 8 MB.");
      return;
    }
    if (kind === "photo") {
      const current = rows.find((r) => r.id === id)?.photos ?? [];
      if (current.length >= MAX_PHOTOS) {
        setErr("Premium sponsors can have one promo image — remove it to add another.");
        return;
      }
    }
    setCrop({ id, kind, src: URL.createObjectURL(file) });
  }

  function closeCrop() {
    setCrop((c) => {
      if (c) URL.revokeObjectURL(c.src);
      return null;
    });
  }

  async function onCropConfirm(res: MediaCropResult) {
    if (!crop) return;
    const { id, kind } = crop;
    closeCrop();
    setUploading(id);
    try {
      const url = await uploadBlob(res.blob, res.type);
      if (!url) return;
      if (kind === "logo") patch(id, { logo: url });
      else setRows((rs) => rs.map((r) => (r.id === id ? { ...r, photos: [...r.photos, url].slice(0, MAX_PHOTOS) } : r)));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  }

  function removePhoto(id: string, url: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, photos: r.photos.filter((p) => p !== url) } : r)));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    const payload: Sponsor[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      url: r.url || null,
      tier: r.tier,
      logo: r.logo,
      photos: r.tier === "premium" ? r.photos : [],
      blurb: r.tier === "premium" ? r.blurb || null : null,
    }));
    const res = await saveSponsors(tournamentId, payload);
    if (res.ok) {
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      router.refresh();
    } else setErr(res.error ?? "Couldn't save.");
    setSaving(false);
  }

  const inputCls = "w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand";

  return (
    <div>
      <div className="mb-4 rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-3 text-xs text-mute">
        All sponsors are listed in a logo grid on your public page. <span className="font-semibold text-ink">Premium</span> sponsors also rotate through a featured ad spot — with a logo, a short blurb, and one promo image.
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-8 text-center text-sm text-mute">No sponsors yet — add your first below.</p>
      ) : (
        <div className="grid gap-4">
          {rows.map((r) => {
            const isPremium = r.tier === "premium";
            const busy = uploading === r.id;
            return (
              <div key={r.id} className="rounded-2xl border border-rule bg-surface shadow-e1 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-xs font-semibold text-mute">Sponsor name</label>
                    <input className={inputCls} value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} placeholder="e.g. Wilson, Local Sports Co." />
                  </div>
                  <button type="button" onClick={() => remove(r.id)} aria-label="Remove sponsor" className="mt-6 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rule bg-bg text-mute transition hover:text-ink">
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-mute">Website link</label>
                    <input className={inputCls} value={r.url} onChange={(e) => patch(r.id, { url: e.target.value })} placeholder="sponsor.com" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-mute">Tier</label>
                    <div className="inline-flex rounded-xl border border-rule bg-bg p-1">
                      <button
                        type="button"
                        onClick={() => patch(r.id, { tier: "standard" })}
                        className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${!isPremium ? "bg-ink text-surface" : "text-mute hover:text-ink"}`}
                      >
                        Standard
                      </button>
                      <button
                        type="button"
                        onClick={() => patch(r.id, { tier: "premium" })}
                        className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${isPremium ? "bg-brand text-white" : "text-mute hover:text-ink"}`}
                      >
                        Premium
                      </button>
                    </div>
                  </div>
                </div>

                {/* logo */}
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-semibold text-mute">Logo</label>
                  <div className="flex items-center gap-3">
                    {r.logo ? (
                      <span className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.logo} alt="" className="h-12 w-12 rounded-xl border border-rule bg-white object-contain p-1" />
                        <button type="button" onClick={() => patch(r.id, { logo: null })} aria-label="Remove logo" className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-white">
                          <X size={11} />
                        </button>
                      </span>
                    ) : null}
                    <label className="press inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-rule bg-bg px-3 py-2 text-sm font-semibold text-ink transition hover:border-brand">
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} {r.logo ? "Replace logo" : "Add logo"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => pickFor(r.id, "logo", e)} />
                    </label>
                  </div>
                  <p className="mt-1.5 text-[11px] text-faint">Square works best — PNG or JPG, around 400×400px, under 8&nbsp;MB. Transparent PNGs sit cleanly on the card. You can crop and reposition after picking.</p>
                </div>

                {/* premium extras */}
                {isPremium ? (
                  <div className="mt-4 rounded-xl border border-brand/30 bg-tint-brand/40 p-3.5">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-deep">Featured ad</p>
                    <label className="mb-1 block text-xs font-semibold text-mute">Short blurb</label>
                    <textarea className={`${inputCls} min-h-20 resize-y`} value={r.blurb} onChange={(e) => patch(r.id, { blurb: e.target.value })} placeholder="One or two lines about this sponsor…" />
                    <label className="mb-1 mt-3 block text-xs font-semibold text-mute">Promo image</label>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {r.photos.map((p) => (
                        <span key={p} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p} alt="" className="h-20 w-28 rounded-lg border border-rule object-cover" />
                          <button type="button" onClick={() => removePhoto(r.id, p)} aria-label="Remove photo" className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-white">
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                      {r.photos.length < MAX_PHOTOS ? (
                        <label className="press inline-flex h-20 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-rule bg-surface text-xs font-semibold text-mute transition hover:border-brand">
                          {busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />} Add photo
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => pickFor(r.id, "photo", e)} />
                        </label>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-[11px] text-brand-deep/70">Landscape (16:9) looks best — JPG or PNG, around 1200×675px, under 8&nbsp;MB. You can crop and reposition after picking.</p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} disabled={rows.length >= MAX_SPONSORS} className="press inline-flex items-center gap-1.5 rounded-xl border border-rule bg-bg px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand disabled:opacity-50">
          <Plus size={15} /> Add sponsor
        </button>
        <button type="button" onClick={save} disabled={saving} className="press inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save sponsors
        </button>
        {savedAt ? <span className="text-xs font-medium text-success">Saved {savedAt}</span> : null}
      </div>
      {err ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-deep">
          <CircleAlert size={13} /> {err}
        </p>
      ) : null}

      {crop ? (
        <MediaCropper
          src={crop.src}
          aspect={crop.kind === "logo" ? 1 : 16 / 9}
          round={false}
          viewportW={crop.kind === "logo" ? 280 : 384}
          outputW={crop.kind === "logo" ? 512 : 1280}
          title={crop.kind === "logo" ? "Position the logo" : "Position the promo image"}
          hint={crop.kind === "logo" ? "Drag to reposition · scroll or pinch to zoom. The framed square is your logo." : "Drag to reposition · scroll or pinch to zoom. The framed area is the promo image."}
          onCancel={closeCrop}
          onConfirm={onCropConfirm}
        />
      ) : null}
    </div>
  );
}
