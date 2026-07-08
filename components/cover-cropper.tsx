"use client";

import { useEffect, useRef, useState } from "react";
import { X, Plus, Check } from "lucide-react";

// Rectangular cover cropper — drag to pan, wheel / pinch / slider to zoom.
// Re-encodes the selected area through a <canvas> (strips EXIF/GPS) into a
// 1500×500 (3:1) JPEG. Same pointer/zoom mechanics as the avatar cropper, but
// the frame is a wide rectangle whose on-screen width adapts to the viewport.
export type CoverCropResult = { blob: Blob; type: string; dataUrl: string };

const ASPECT = 3; // width / height
const OUT_W = 1500;
const OUT_H = OUT_W / ASPECT;

export function CoverCropper({
  src,
  onCancel,
  onConfirm,
}: {
  src: string;
  onCancel: () => void;
  onConfirm: (result: CoverCropResult) => void;
}) {
  const [vw, setVw] = useState(480);
  const vh = Math.round(vw / ASPECT);

  const [iw, setIw] = useState(0);
  const [ih, setIh] = useState(0);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [busy, setBusy] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const vwRef = useRef(480);
  const iwRef = useRef(0);
  const ihRef = useRef(0);
  const sRef = useRef(1);
  const xRef = useRef(0);
  const yRef = useRef(0);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  const coverFit = (w: number) => {
    const ivw = w;
    const ivh = Math.round(w / ASPECT);
    if (!iwRef.current || !ihRef.current) return 1;
    return Math.max(ivw / iwRef.current, ivh / ihRef.current);
  };
  const clampX = (s: number, x: number) => {
    const w = vwRef.current;
    const cover = coverFit(w);
    const m = Math.max(0, (iwRef.current * cover * s - w) / 2);
    return Math.max(-m, Math.min(m, x));
  };
  const clampY = (s: number, y: number) => {
    const w = vwRef.current;
    const h = Math.round(w / ASPECT);
    const cover = coverFit(w);
    const m = Math.max(0, (ihRef.current * cover * s - h) / 2);
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

  // Load the image.
  useEffect(() => {
    const im = new Image();
    im.onload = () => {
      imgRef.current = im;
      iwRef.current = im.naturalWidth;
      ihRef.current = im.naturalHeight;
      sRef.current = 1;
      xRef.current = 0;
      yRef.current = 0;
      setIw(im.naturalWidth);
      setIh(im.naturalHeight);
      setScale(1);
      setTx(0);
      setTy(0);
    };
    im.src = src;
  }, [src]);

  // Size the frame to the available width (responsive).
  useEffect(() => {
    const el = measureRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.round(entries[0].contentRect.width);
      const next = Math.max(240, Math.min(560, w));
      vwRef.current = next;
      setVw(next);
      setView(sRef.current, xRef.current, yRef.current);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on Escape.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCancel]);

  // Wheel to zoom.
  useEffect(() => {
    const el = frameRef.current;
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
    const im = imgRef.current;
    if (!im || !iwRef.current) return;
    setBusy(true);
    const w = vwRef.current;
    const h = Math.round(w / ASPECT);
    const cover = coverFit(w);
    const s = sRef.current;
    const k = cover * s;
    const dw = iwRef.current * k;
    const dh = ihRef.current * k;
    const left = w / 2 - dw / 2 + xRef.current;
    const top = h / 2 - dh / 2 + yRef.current;
    const sx = (0 - left) / k;
    const sy = (0 - top) / k;
    const sW = w / k;
    const sH = h / k;

    const cv = document.createElement("canvas");
    cv.width = OUT_W;
    cv.height = OUT_H;
    const ctx = cv.getContext("2d");
    if (!ctx) {
      setBusy(false);
      return;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(im, sx, sy, sW, sH, 0, 0, OUT_W, OUT_H);
    const blob = await new Promise<Blob | null>((r) => cv.toBlob((b) => r(b), "image/jpeg", 0.85));
    if (!blob) {
      setBusy(false);
      return;
    }
    const fr = new FileReader();
    fr.onload = () => {
      setBusy(false);
      onConfirm({ blob, type: "image/jpeg", dataUrl: String(fr.result) });
    };
    fr.readAsDataURL(blob);
  };

  const cover = iw && ih ? Math.max(vw / iw, vh / ih) : 1;
  const dw = iw ? iw * cover * scale : 0;
  const dh = ih ? ih * cover * scale : 0;
  const left = vw / 2 - dw / 2 + tx;
  const top = vh / 2 - dh / 2 + ty;
  const ready = iw > 0;

  return (
    <div role="dialog" aria-modal="true" aria-label="Position your cover photo" className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-5 backdrop-blur-md">
      <div className="rise w-full max-w-2xl rounded-3xl border border-rule bg-surface p-5 shadow-[0_24px_70px_-20px_rgba(10,10,11,0.5)]">
        <div className="flex items-center justify-between">
          <span className="kicker text-brand-deep">Position your cover photo</span>
          <button onClick={onCancel} aria-label="Close" className="press grid h-8 w-8 place-items-center rounded-full text-faint transition-colors hover:text-ink">
            <X size={18} aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-mute">Drag to reposition · scroll or pinch to zoom. The framed area is what shows on your profile.</p>

        <div ref={measureRef} className="mt-4 w-full">
          <div
            ref={frameRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            className="relative mx-auto cursor-grab overflow-hidden rounded-2xl bg-bg ring-1 ring-rule"
            style={{ width: vw, height: vh, touchAction: "none" }}
          >
            {ready ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt=""
                draggable={false}
                style={{ position: "absolute", width: dw, height: dh, left, top, maxWidth: "none", userSelect: "none", pointerEvents: "none" }}
              />
            ) : null}
            <div aria-hidden style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.85)", borderRadius: 16, pointerEvents: "none" }} />
          </div>
        </div>

        <div className="mx-auto mt-4 flex max-w-md items-center gap-3">
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
          <button onClick={confirm} disabled={busy || !ready} className="press flex flex-1 items-center justify-center gap-1.5 rounded-full bg-brand py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60 shadow-md shadow-brand/25">
            {busy ? "Saving…" : (<><Check size={16} aria-hidden /> Set cover</>)}
          </button>
        </div>
      </div>
    </div>
  );
}
