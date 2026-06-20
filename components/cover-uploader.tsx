"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createCoverUploadUrl, commitCover, removeCover } from "@/app/account/avatar-actions";

export function CoverUploader({ initialUrl, hue }: { initialUrl: string | null; hue: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    setBusy(true);
    setErr(false);
    try {
      const supabase = createClient();
      const { path, token } = await createCoverUploadUrl(f.type);
      const { error } = await supabase.storage.from("avatars").uploadToSignedUrl(path, token, f, { contentType: f.type });
      if (error) throw error;
      const { url: pub } = await commitCover(path);
      setUrl(`${pub}?v=${Date.now()}`);
      router.refresh();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setUrl(null);
    try {
      await removeCover();
      router.refresh();
    } catch {
      /* non-fatal */
    }
  }

  return (
    <div
      className="relative h-44 w-full overflow-hidden rounded-3xl sm:h-56 lg:h-64"
      style={{ background: `linear-gradient(135deg, hsl(${hue},70%,52%) 0%, hsl(${(hue + 32) % 360},66%,38%) 100%)` }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Your cover photo" className="h-full w-full object-cover" />
      ) : null}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
      {/* z-20 keeps these controls above the identity header (z-10), which is
          pulled up over the cover with a negative margin and would otherwise
          sit on top of this button and swallow the click. */}
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
      {err ? (
        <p className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-xs text-white">Couldn&rsquo;t upload — try again.</p>
      ) : null}
    </div>
  );
}
