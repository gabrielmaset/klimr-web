"use client";

import { useRef, useState } from "react";
import { SportIcon } from "@/components/sport-icons";
import { ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MediaCropper, type MediaCropResult } from "@/components/media-cropper";
import { createEventCoverUploadUrl, setEventCover, removeEventCover } from "@/app/events/actions";

const BUCKET = "tournament-gallery";

export function EventHeroCover({
  eventId,
  initialUrl,
  canEdit,
  sportKey,
  children,
}: {
  eventId: string;
  initialUrl: string | null;
  canEdit: boolean;
  sportKey: string;
  children: React.ReactNode;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return;
    if (f.size > 12 * 1024 * 1024) return;
    setCropSrc(URL.createObjectURL(f));
  }

  async function onConfirm(res: MediaCropResult) {
    setCropSrc(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const signed = await createEventCoverUploadUrl(eventId, res.type);
      if (signed.ok) {
        const up = await supabase.storage.from(BUCKET).uploadToSignedUrl(signed.path, signed.token, res.blob, { contentType: res.type });
        if (!up.error) {
          const saved = await setEventCover(eventId, signed.path);
          if (saved.ok) setUrl(saved.url);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const r = await removeEventCover(eventId);
      if (r.ok) setUrl(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-[360px] overflow-hidden rounded-[2rem] border border-rail-border sm:min-h-[460px]">
      {url ? (
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#0e2c3a,#0a212c)]">
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 select-none opacity-[0.09]"><SportIcon sport={sportKey} variant="hero" size={265} /></span>
          <span aria-hidden className="pointer-events-none absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-brand/25 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute right-10 top-1/3 h-40 w-40 rounded-full bg-[#16a34a]/15 blur-3xl" />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/15" />

      {canEdit ? (
        <div className="absolute right-4 top-4 z-10 flex gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="press inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/65">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} {url ? "Change photo" : "Add photo"}
          </button>
          {url ? (
            <button type="button" onClick={remove} disabled={busy} aria-label="Remove photo" className="press grid h-8 w-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65">
              <X size={14} />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="relative flex min-h-[360px] flex-col justify-end p-6 sm:min-h-[460px] sm:p-9">{children}</div>

      {cropSrc ? <MediaCropper src={cropSrc} aspect={16 / 9} outputW={1600} title="Position the cover photo" onCancel={() => setCropSrc(null)} onConfirm={onConfirm} /> : null}
    </div>
  );
}
