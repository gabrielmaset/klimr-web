"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Trash2, Plus, ImagePlus, CircleAlert, X, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createGalleryUploadUrl, savePrizes } from "@/app/tournaments/actions";
import { MediaCropper, type MediaCropResult } from "@/components/media-cropper";
import type { Prize } from "@/lib/tournament";

const BUCKET = "tournament-gallery";
const MAX_PRIZES = 80;

type Division = { id: string; name: string };
type Row = { id: string; divisionId: string; place: string; title: string; description: string; photo: string | null };

function uid() {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}
function toRow(p: Prize): Row {
  return {
    id: p.id || uid(),
    divisionId: p.divisionId ?? "",
    place: p.place ?? "",
    title: p.title ?? "",
    description: p.description ?? "",
    photo: p.photo ?? null,
  };
}

export function PrizesEditor({ tournamentId, initial, divisions }: { tournamentId: string; initial: Prize[]; divisions: Division[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial.map(toRow));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ id: string; src: string } | null>(null);

  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  function add() {
    if (rows.length >= MAX_PRIZES) return;
    setRows((rs) => [...rs, { id: uid(), divisionId: "", place: "", title: "", description: "", photo: null }]);
  }
  function remove(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  async function uploadBlob(blob: Blob, type: string): Promise<string | null> {
    const supabase = createClient();
    const signed = await createGalleryUploadUrl(tournamentId, type);
    if (!signed.ok) throw new Error(signed.error ?? "Upload failed.");
    const up = await supabase.storage.from(BUCKET).uploadToSignedUrl(signed.path, signed.token, blob, { contentType: type });
    if (up.error) throw new Error(up.error.message);
    return supabase.storage.from(BUCKET).getPublicUrl(signed.path).data.publicUrl;
  }

  function pickFor(id: string, e: React.ChangeEvent<HTMLInputElement>) {
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
    setCrop({ id, src: URL.createObjectURL(file) });
  }

  function closeCrop() {
    setCrop((c) => {
      if (c) URL.revokeObjectURL(c.src);
      return null;
    });
  }

  async function onCropConfirm(res: MediaCropResult) {
    if (!crop) return;
    const { id } = crop;
    closeCrop();
    setUploading(id);
    try {
      const url = await uploadBlob(res.blob, res.type);
      if (url) patch(id, { photo: url });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    setSaving(true);
    setErr(null);
    const payload: Prize[] = rows.map((r) => ({
      id: r.id,
      divisionId: r.divisionId || null,
      place: r.place || null,
      title: r.title,
      description: r.description || null,
      photo: r.photo,
    }));
    const res = await savePrizes(tournamentId, payload);
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
        List what winners take home. Prizes can be tied to a specific division or apply to the whole event — set the division per prize. A photo is optional but makes the prize pop on your public page.
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-8 text-center text-sm text-mute">No prizes yet — add your first below.</p>
      ) : (
        <div className="grid gap-4">
          {rows.map((r) => {
            const busy = uploading === r.id;
            return (
              <div key={r.id} className="rounded-2xl border border-rule bg-surface shadow-e1 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tint-brand text-brand-deep">
                    <Trophy size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-xs font-semibold text-mute">Prize</label>
                    <input className={inputCls} value={r.title} onChange={(e) => patch(r.id, { title: e.target.value })} placeholder="e.g. $500 cash, Trophy + medals" />
                  </div>
                  <button type="button" onClick={() => remove(r.id)} aria-label="Remove prize" className="mt-6 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rule bg-bg text-mute transition hover:text-ink">
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-mute">Division</label>
                    <select className={inputCls} value={r.divisionId} onChange={(e) => patch(r.id, { divisionId: e.target.value })}>
                      <option value="">All divisions</option>
                      {divisions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-mute">Placement (optional)</label>
                    <input className={inputCls} value={r.place} onChange={(e) => patch(r.id, { place: e.target.value })} placeholder="e.g. 1st, Champion, Finalist" />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="mb-1 block text-xs font-semibold text-mute">Details (optional)</label>
                  <textarea className={`${inputCls} min-h-16 resize-y`} value={r.description} onChange={(e) => patch(r.id, { description: e.target.value })} placeholder="Anything worth noting — gift card brand, sponsor, split between players…" />
                </div>

                <div className="mt-3">
                  <label className="mb-1 block text-xs font-semibold text-mute">Photo (optional)</label>
                  <div className="flex items-center gap-3">
                    {r.photo ? (
                      <span className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.photo} alt="" className="h-16 w-20 rounded-xl border border-rule object-cover" />
                        <button type="button" onClick={() => patch(r.id, { photo: null })} aria-label="Remove photo" className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-white">
                          <X size={11} />
                        </button>
                      </span>
                    ) : null}
                    <label className="press inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-rule bg-bg px-3 py-2 text-sm font-semibold text-ink transition hover:border-brand">
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} {r.photo ? "Replace photo" : "Add photo"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => pickFor(r.id, e)} />
                    </label>
                  </div>
                  <p className="mt-1.5 text-[11px] text-faint">Landscape (4:3) looks best — JPG or PNG, under 8&nbsp;MB. You can crop and reposition after picking.</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} disabled={rows.length >= MAX_PRIZES} className="press inline-flex items-center gap-1.5 rounded-xl border border-rule bg-bg px-4 py-2 text-sm font-semibold text-ink transition hover:border-brand disabled:opacity-50">
          <Plus size={15} /> Add prize
        </button>
        <button type="button" onClick={save} disabled={saving} className="press inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save prizes
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
          aspect={4 / 3}
          round={false}
          viewportW={360}
          outputW={1000}
          title="Position the prize photo"
          hint="Drag to reposition · scroll or pinch to zoom. The framed area is the photo."
          onCancel={closeCrop}
          onConfirm={onCropConfirm}
        />
      ) : null}
    </div>
  );
}
