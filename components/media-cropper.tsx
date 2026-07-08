"use client";

import { useEffect, useRef, useState } from "react";
import { X, Plus, Check } from "lucide-react";

/**
 * Rectangular image cropper — drag to pan, wheel / pinch / slider to zoom.
 * Aspect is configurable (1 for a square logo, 16/9 for a landscape promo).
 * Re-encodes through a <canvas> (which strips EXIF + GPS metadata) into a WebP
 * (JPEG fallback for older Safari) sized to `outputW × outputW/aspect`. Returns
 * the blob to upload.
 *
 * Render-driving state (scale / pan / dims) is mirrored into refs so pointer
 * math can run synchronously inside handlers without reading state in render.
 */
export type MediaCropResult = { blob: Blob; type: string; dataUrl: string };

type Dims = { iw: number; ih: number; cover: number };

export function MediaCropper({
  src,
  aspect = 1,
  onCancel,
  onConfirm,
  viewportW = 320,
  outputW = 640,
  title = "Position your image",
  hint = "Drag to reposition · scroll or pinch to zoom. The framed area is what shows.",
  round = false,
}: {
  src: string;
  aspect?: number;
  onCancel: () => void;
  onConfirm: (result: MediaCropResult) => void;
  viewportW?: number;
  outputW?: number;
  title?: string;
  hint?: string;
  round?: boolean;
}) {
  const VW = viewportW;
  const VH = Math.round(viewportW / aspect);
  const OW = outputW;
  const OH = Math.round(outputW / aspect);

  const [dims, setDims] = useState<Dims | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [busy, setBusy] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const dimsRef = useRef<Dims | null>(null);
  const sRef = useRef(1);
  const xRef = useRef(0);
  const yRef = useRef(0);
  const vpRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const clampX = (s: number, x: number) => {
    const d = dimsRef.current;
    if (!d) return x;
    const m = Math.max(0, (d.iw * d.cover * s - VW) / 2);
    return Math.max(-m, Math.min(m, x));
  };
  const clampY = (s: number, y: number) => {
    const d = dimsRef.current;
    if (!d) return y;
    const m = Math.max(0, (d.ih * d.cover * s - VH) / 2);
    return Math.max(-m, Math.min(m, y));
  };
  const setView = (s: number, x: number, y: number) => {
    const ns = Math.max(1, Math.min(4, s));
    const nx = clampX(ns, x);
    const ny = clampY(ns, y);
    sRef.current = ns;
    xRef.current = nx;
    yRef.current = ny;
    setScale(ns);
    setTx(nx);
    setTy(ny);
  };

  useEffect(() => {
    const im = new Image();
    im.onload = () => {
      const cover = Math.max(VW / im.naturalWidth, VH / im.naturalHeight);
      const d: Dims = { iw: im.naturalWidth, ih: im.naturalHeight, cover };
      imgRef.current = im;
      dimsRef.current = d;
      sRef.current = 1;
      xRef.current = 0;
      yRef.current = 0;
      setDims(d);
      setScale(1);
      setTx(0);
      setTy(0);
    };
    im.src = src;
  }, [src, VW, VH]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCancel]);

  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const w = (e: WheelEvent) => {
      e.preventDefault();
      setView(sRef.current * (1 - e.deltaY * 0.0015), xRef.current, yRef.current);
    };
    el.addEventListener("wheel", w, { passive: false });
    return () => el.removeEventListener("wheel", w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const p = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, scale: sRef.current };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY };
    }
  };
  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const p = [...pointers.current.values()];
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      setView(pinch.current.scale * (d / pinch.current.dist), xRef.current, yRef.current);
    } else if (drag.current) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current = { x: e.clientX, y: e.clientY };
      setView(sRef.current, xRef.current + dx, yRef.current + dy);
    }
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  const confirm = async () => {
    const d = dimsRef.current;
    const im = imgRef.current;
    if (!d || !im) return;
    setBusy(true);
    const s = sRef.current;
    const dw = d.iw * d.cover * s;
    const dh = d.ih * d.cover * s;
    const left = VW / 2 - dw / 2 + xRef.current;
    const top = VH / 2 - dh / 2 + yRef.current;
    const k = d.cover * s;
    const sx = (0 - left) / k;
    const sy = (0 - top) / k;
    const sW = VW / k;
    const sH = VH / k;
    const cv = document.createElement("canvas");
    cv.width = OW;
    cv.height = OH;
    const ctx = cv.getContext("2d");
    if (!ctx) {
      setBusy(false);
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(im, sx, sy, sW, sH, 0, 0, OW, OH);
    const toBlob = (t: string, q: number) => new Promise<Blob | null>((r) => cv.toBlob((b) => r(b), t, q));
    let type = "image/webp";
    let blob = await toBlob(type, 0.9);
    if (!blob) {
      type = "image/jpeg";
      blob = await toBlob(type, 0.9);
    }
    if (!blob) {
      setBusy(false);
      return;
    }
    const fr = new FileReader();
    fr.onload = () => {
      setBusy(false);
      onConfirm({ blob: blob as Blob, type, dataUrl: String(fr.result) });
    };
    fr.readAsDataURL(blob);
  };

  const dw = dims ? dims.iw * dims.cover * scale : 0;
  const dh = dims ? dims.ih * dims.cover * scale : 0;
  const left = VW / 2 - dw / 2 + tx;
  const top = VH / 2 - dh / 2 + ty;
  const ready = dims !== null;

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-5 backdrop-blur-md">
      <div className="rise w-full max-w-md rounded-3xl border border-rule bg-surface p-5 shadow-[0_24px_70px_-20px_rgba(10,10,11,0.5)]">
        <div className="flex items-center justify-between">
          <span className="kicker text-brand-deep">{title}</span>
          <button onClick={onCancel} aria-label="Close" className="press grid h-8 w-8 place-items-center rounded-full text-faint transition-colors hover:text-ink">
            <X size={18} aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-mute">{hint}</p>

        <div
          ref={vpRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="relative mx-auto mt-4 cursor-grab overflow-hidden rounded-2xl bg-bg"
          style={{ width: VW, height: VH, touchAction: "none" }}
        >
          {ready ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" draggable={false} style={{ position: "absolute", width: dw, height: dh, left, top, maxWidth: "none", userSelect: "none", pointerEvents: "none" }} />
          ) : null}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: VW,
              height: VH,
              borderRadius: round ? "50%" : "14px",
              boxShadow: "0 0 0 9999px rgba(10,10,11,0.5)",
              border: "2px solid rgba(255,255,255,0.92)",
              pointerEvents: "none",
            }}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={() => setView(sRef.current - 0.3, xRef.current, yRef.current)} aria-label="Zoom out" className="press grid h-9 w-9 shrink-0 place-items-center rounded-full border border-rule text-ink-soft">
            <span className="text-lg leading-none">−</span>
          </button>
          <input type="range" min={1} max={4} step={0.01} value={scale} onChange={(e) => setView(parseFloat(e.target.value), xRef.current, yRef.current)} aria-label="Zoom" className="h-1 flex-1 accent-brand" />
          <button onClick={() => setView(sRef.current + 0.3, xRef.current, yRef.current)} aria-label="Zoom in" className="press grid h-9 w-9 shrink-0 place-items-center rounded-full border border-rule text-ink-soft">
            <Plus size={16} aria-hidden />
          </button>
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={onCancel} className="press flex-1 rounded-full border border-rule bg-surface py-2.5 text-sm font-semibold text-ink-soft">Cancel</button>
          <button onClick={confirm} disabled={busy || !ready} className="press flex flex-1 items-center justify-center gap-1.5 rounded-full bg-brand py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60">
            {busy ? "Saving…" : (<><Check size={16} aria-hidden /> Use image</>)}
          </button>
        </div>
      </div>
    </div>
  );
}
