"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, FileCheck2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { submitPaymentProof } from "@/app/tournaments/actions";

const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif", "application/pdf"];

/** Downscale + re-encode images to a sane resolution before upload — proofs only
 *  need to be legible, not high-res, which keeps storage small. PDFs and anything
 *  the browser can't decode (e.g. some HEIC) pass through untouched. */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.7));
    bitmap.close();
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function PaymentProofUpload({ registrationId }: { registrationId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function pick(f: File | null) {
    setErr(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!OK_TYPES.includes(f.type)) {
      setErr("Upload a PDF or image (PNG, JPG, WebP, HEIC).");
      return;
    }
    if (f.size > MAX_BYTES) {
      setErr("That file is over the 10 MB limit.");
      return;
    }
    setFile(f);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const toUpload = await compressImage(file);
      const fromName = toUpload.name.includes(".") ? toUpload.name.split(".").pop()!.toLowerCase() : "";
      const ext = fromName || (toUpload.type === "application/pdf" ? "pdf" : "jpg");
      const path = `${registrationId}/proof-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("tournament-payments").upload(path, toUpload, { contentType: toUpload.type, upsert: false });
      if (upErr) {
        setErr(upErr.message || "Upload failed. Please try again.");
        setBusy(false);
        return;
      }
      const res = await submitPaymentProof(registrationId, path);
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error ?? "Couldn't save your proof.");
        setBusy(false);
      }
    } catch {
      setErr("Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif,application/pdf"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-bg/40 px-3.5 py-3">
          <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
            <FileCheck2 size={16} className="shrink-0 text-success" />
            <span className="truncate">{file.name}</span>
            <span className="shrink-0 text-xs text-faint">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
          </span>
          {!busy ? (
            <button type="button" onClick={() => pick(null)} className="shrink-0 text-mute hover:text-ink" aria-label="Remove file">
              <X size={16} />
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-rule bg-bg/40 px-4 py-5 text-sm font-medium text-mute transition-colors hover:border-brand hover:text-ink"
        >
          <Upload size={16} /> Choose a PDF or image
        </button>
      )}
      <div className="mt-2.5 flex items-center gap-3">
        <button type="button" onClick={upload} disabled={!file || busy} className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Submit payment proof
        </button>
        {err ? <span className="text-xs font-semibold text-brand-deep">{err}</span> : null}
      </div>
      <p className="mt-2 text-[11px] text-faint">Stored privately and encrypted — only you and the organizer can open it.</p>
    </div>
  );
}
