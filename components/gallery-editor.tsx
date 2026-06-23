"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Trash2, CircleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createGalleryUploadUrl, commitGalleryPhoto, removeGalleryPhoto } from "@/app/tournaments/actions";

const BUCKET = "tournament-gallery";
const MAX = 5;

export function GalleryEditor({ tournamentId, initial }: { tournamentId: string; initial: string[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = useState<string[]>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setErr(null);
    setBusy(true);
    const supabase = createClient();
    let added = [...photos];
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
        added = [...added, committed.url];
        setPhotos(added);
      }
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function remove(url: string) {
    setPhotos((p) => p.filter((u) => u !== url));
    const res = await removeGalleryPhoto(tournamentId, url);
    if (!res.ok) setErr(res.error ?? "Couldn't remove the photo.");
    router.refresh();
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={pick} />
      {photos.length ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((url) => (
            <div key={url} className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-rule bg-bg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Event photo" className="h-full w-full object-cover" loading="lazy" />
              <button
                type="button"
                onClick={() => remove(url)}
                aria-label="Remove photo"
                className="press absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-6 text-center text-sm text-mute">No photos yet — add shots from past events or the venue to bring your page to life.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || photos.length >= MAX}
          className="press inline-flex items-center gap-1.5 rounded-xl border border-rule bg-bg px-4 py-2 text-sm font-semibold text-ink hover:border-brand disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />} Add photos
        </button>
        <span className="text-xs text-faint">
          {photos.length}/{MAX} · JPG, PNG, or WebP up to 8&nbsp;MB
        </span>
      </div>
      {err ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-brand-deep">
          <CircleAlert size={13} /> {err}
        </p>
      ) : null}
    </div>
  );
}
