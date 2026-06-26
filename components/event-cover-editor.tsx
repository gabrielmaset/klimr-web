"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2, CircleAlert, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MediaCropper, type MediaCropResult } from "@/components/media-cropper";
import { createEventCoverUploadUrl, setEventCover, removeEventCover } from "@/app/events/actions";

const BUCKET = "tournament-gallery";

export function EventCoverEditor({ eventId, initialUrl }: { eventId: string; initialUrl: string | null }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null);
    if (!f.type.startsWith("image/")) return setErr("Please choose an image.");
    if (f.size > 12 * 1024 * 1024) return setErr("Image must be under 12 MB.");
    setCropSrc(URL.createObjectURL(f));
  }

  async function onConfirm(result: MediaCropResult) {
    setCropSrc(null);
    setErr(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const signed = await createEventCoverUploadUrl(eventId, result.type);
      if (!signed.ok) return setErr(signed.error ?? "Upload failed.");
      const up = await supabase.storage.from(BUCKET).uploadToSignedUrl(signed.path, signed.token, result.blob, { contentType: result.type });
      if (up.error) return setErr(up.error.message);
      const saved = await setEventCover(eventId, signed.path);
      if (!saved.ok) return setErr(saved.error ?? "Couldn't save the photo.");
      setUrl(saved.url);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setErr(null);
    try {
      const res = await removeEventCover(eventId);
      if (!res.ok) return setErr(res.error ?? "Couldn't remove the photo.");
      setUrl(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />

      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl border border-rule bg-bg">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Event cover" className="h-full w-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-mute transition-colors hover:bg-surface hover:text-ink"
          >
            <ImagePlus size={26} />
            <span className="text-sm font-semibold">Add a cover photo</span>
            <span className="px-6 text-center text-xs text-faint">A square photo of the venue or a past event helps people picture it.</span>
          </button>
        )}

        {busy ? (
          <div className="absolute inset-0 grid place-items-center bg-black/30">
            <Loader2 size={22} className="animate-spin text-white" />
          </div>
        ) : null}

        {url ? (
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Change cover photo"
              className="press grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/70"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={remove}
              aria-label="Remove cover photo"
              className="press grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/70"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : null}
      </div>

      {err ? (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-deep">
          <CircleAlert size={13} /> {err}
        </p>
      ) : null}

      {cropSrc ? (
        <MediaCropper
          src={cropSrc}
          aspect={1}
          outputW={900}
          title="Position your cover photo"
          onCancel={() => setCropSrc(null)}
          onConfirm={onConfirm}
        />
      ) : null}
    </div>
  );
}
