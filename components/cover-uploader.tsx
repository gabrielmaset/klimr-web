"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2, CircleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createCoverUploadUrl, commitCover, removeCover } from "@/app/account/avatar-actions";
import { CoverCropper, type CoverCropResult } from "@/components/cover-cropper";
import { logger } from "@/lib/logger";

export function CoverUploader({ initialUrl, hue }: { initialUrl: string | null; hue: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rawSrc, setRawSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErr("Please choose an image file.");
      return;
    }
    setErr(null);
    const r = new FileReader();
    r.onload = () => {
      setRawSrc(String(r.result));
      setCropOpen(true);
    };
    r.onerror = () => {
      setErr("Couldn't read that file.");
      logger.error("Cover photo read failed", `${f.name} (${f.type})`);
    };
    r.readAsDataURL(f);
  }

  async function onCropConfirm(result: CoverCropResult) {
    setCropOpen(false);
    setRawSrc(null);
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const { path, token } = await createCoverUploadUrl(result.type);
      const { error } = await supabase.storage.from("avatars").uploadToSignedUrl(path, token, result.blob, { contentType: result.type });
      if (error) throw error;
      const { url: pub } = await commitCover(path);
      setUrl(`${pub}?v=${Date.now()}`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Couldn't upload the cover photo. Please try again.";
      setErr(msg);
      logger.error("Cover photo upload failed", e);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setUrl(null);
    setErr(null);
    try {
      await removeCover();
      router.refresh();
    } catch (e) {
      logger.warn("Cover photo removal failed", e);
    }
  }

  return (
    <div
      className="relative h-60 w-full overflow-hidden rounded-3xl sm:h-72 lg:h-80"
      style={{ background: `linear-gradient(135deg, hsl(${hue},70%,52%) 0%, hsl(${(hue + 32) % 360},66%,38%) 100%)` }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Your cover photo" className="h-full w-full object-cover" />
      ) : null}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />

      {/* Error banner sits at the TOP (z-30) so it's never hidden behind the
          avatar/identity header, which overlaps the bottom-left of the cover. */}
      {err ? (
        <div className="absolute left-3 right-3 top-3 z-30 flex items-start gap-2 rounded-xl bg-black/70 px-3 py-2 text-xs text-white backdrop-blur">
          <CircleAlert size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{err}</span>
        </div>
      ) : null}

      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2">
        {url ? (
          <button
            type="button"
            onClick={remove}
            aria-label="Remove cover photo"
            className="press grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/60"
          >
            <Trash2 size={15} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="press inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {url ? "Change cover" : "Add cover photo"}
        </button>
      </div>

      {cropOpen && rawSrc ? <CoverCropper src={rawSrc} onCancel={() => { setCropOpen(false); setRawSrc(null); }} onConfirm={onCropConfirm} /> : null}
    </div>
  );
}
