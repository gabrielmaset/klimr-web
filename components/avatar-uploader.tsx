"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createAvatarUploadUrl, commitAvatar, removeAvatar } from "@/app/account/avatar-actions";
import { AvatarCropper, type CropResult } from "@/components/avatar-cropper";

type Status = "idle" | "uploading" | "error";

export function AvatarUploader({
  initialPhotoUrl,
  hue,
  name,
  size = 80,
  onUploaded,
}: {
  initialPhotoUrl: string | null;
  hue: number;
  name: string;
  size?: number;
  onUploaded?: (url: string) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const lastCrop = useRef<CropResult | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl);
  const [rawSrc, setRawSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  const initials =
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "K";

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = () => {
      setRawSrc(String(r.result));
      setCropOpen(true);
    };
    r.readAsDataURL(f);
  }

  async function upload(crop: CropResult) {
    setStatus("uploading");
    try {
      const supabase = createClient();
      const { path, token } = await createAvatarUploadUrl(crop.type);
      const { error } = await supabase.storage
        .from("avatars")
        .uploadToSignedUrl(path, token, crop.blob, { contentType: crop.type });
      if (error) throw error;
      const { url } = await commitAvatar(path);
      // Cache-bust so the freshly committed object renders immediately.
      setPhotoUrl(`${url}?v=${Date.now()}`);
      onUploaded?.(url);
      setStatus("idle");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  function onConfirm(crop: CropResult) {
    lastCrop.current = crop;
    setPhotoUrl(crop.dataUrl); // optimistic preview
    setCropOpen(false);
    void upload(crop);
  }

  async function onRemove() {
    setPhotoUrl(null);
    setStatus("idle");
    try {
      await removeAvatar();
      router.refresh();
    } catch {
      /* non-fatal */
    }
  }

  return (
    <div className="flex items-center gap-4">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />

      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="Your profile photo"
            className="h-full w-full rounded-full object-cover ring-2 ring-surface"
            style={{ boxShadow: "0 6px 22px -10px rgba(10,10,11,0.35)" }}
          />
        ) : (
          <div
            aria-hidden
            className="grid h-full w-full place-items-center rounded-full font-display text-surface"
            style={{
              fontSize: size * 0.36,
              background: `linear-gradient(145deg, hsl(${hue},85%,62%) 0%, hsl(${(hue + 22) % 360},80%,48%) 100%)`,
            }}
          >
            {initials}
          </div>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={photoUrl ? "Change photo" : "Add a photo"}
          className="press absolute -bottom-0.5 -right-0.5 grid h-8 w-8 place-items-center rounded-full bg-ink text-surface ring-2 ring-surface transition-colors hover:bg-brand"
        >
          {status === "uploading" ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <Camera size={14} aria-hidden />
          )}
        </button>
      </div>

      <div className="min-w-0">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="press text-sm font-semibold text-ink transition-colors hover:text-brand-deep"
        >
          {photoUrl ? "Change photo" : "Add a photo"}
        </button>
        {photoUrl ? (
          <button
            type="button"
            onClick={onRemove}
            className="ml-3 text-sm text-mute transition-colors hover:text-ink"
          >
            Remove
          </button>
        ) : null}
        <p className="mt-1 text-[12px] leading-snug text-faint">
          {status === "uploading" ? (
            "Saving to your profile…"
          ) : status === "error" ? (
            <span className="text-brand-deep">
              Couldn&apos;t save.{" "}
              <button
                type="button"
                onClick={() => lastCrop.current && upload(lastCrop.current)}
                className="underline underline-offset-2"
              >
                Retry
              </button>
            </span>
          ) : photoUrl ? (
            <span className="inline-flex items-center gap-1 text-success">
              <Check size={12} aria-hidden /> Looks great
            </span>
          ) : (
            "A real headshot builds trust — location data is stripped before upload."
          )}
        </p>
      </div>

      {cropOpen && rawSrc ? (
        <AvatarCropper src={rawSrc} onCancel={() => setCropOpen(false)} onConfirm={onConfirm} />
      ) : null}
    </div>
  );
}
