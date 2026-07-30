"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { FinderCourt } from "./courts-finder";

/** Courts map — Mapbox GL restyled to Daylight (§6): parchment land, muted
 *  water, quiet parks, cream minor roads, warm arterials; POI/transit noise
 *  hidden; labels recolored. Numbered teardrop pins cross-highlight with the
 *  list, the selected court gets a callout, and the radius halo tweens when
 *  the radius changes (reduced-motion → instant). */

const FALLBACK: [number, number] = [-118.4344, 34.0031];

const RESTYLE: { match: RegExp; kind: "fill" | "line" | "background"; color: string }[] = [
  { match: /water/, kind: "fill", color: "#CFE3F2" },
  { match: /^background$/, kind: "background", color: "#F5F1E6" },
  { match: /landuse|landcover|park|pitch|grass|golf|cemetery/, kind: "fill", color: "#E1EBD6" },
  { match: /land-structure|building/, kind: "fill", color: "#EDE8DB" },
];

function circleRing(lat: number, lng: number, radiusMi: number): [number, number][] {
  const pts: [number, number][] = [];
  const dLat = radiusMi / 69;
  const dLng = radiusMi / (69 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]);
  }
  return pts;
}

function applyDaylight(map: MapboxMap) {
  // Per-layer try/catch: one incompatible paint property must never abort the
  // whole recolor pass (that failure mode shipped a stock-looking map once).
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    const id = layer.id;
    try {
      if (/poi|transit/.test(id) && layer.type === "symbol") {
        map.setLayoutProperty(id, "visibility", "none");
        continue;
      }
      if (layer.type === "fill" && /water|ocean|sea/.test(id)) {
        map.setPaintProperty(id, "fill-color", "#CFE3F2");
        continue;
      }
      if (layer.type === "line" && /waterway|water-line|shoreline/.test(id)) {
        map.setPaintProperty(id, "line-color", "#B9D3E8");
        continue;
      }
      for (const r of RESTYLE) {
        if (!r.match.test(id)) continue;
        if (r.kind === "background" && layer.type === "background") map.setPaintProperty(id, "background-color", r.color);
        if (r.kind === "fill" && layer.type === "fill") map.setPaintProperty(id, "fill-color", r.color);
      }
      if (layer.type === "line" && /road|street|bridge|tunnel/.test(id)) {
        const warm = /motorway|trunk|major/.test(id) ? "#F2C98C" : /primary|secondary|arterial/.test(id) ? "#FFFFFF" : "#EDE7D9";
        map.setPaintProperty(id, "line-color", warm);
      }
      if (layer.type === "symbol" && /label|place|settlement/.test(id)) {
        map.setPaintProperty(id, "text-color", "#8A8069");
        map.setPaintProperty(id, "text-halo-color", "#F5F1E6");
      }
    } catch {
      /* this layer's schema differs — skip it, keep going */
    }
  }
}

/** Upsert the radius halo (dashed flame ring + tint) for the given ring. */
function drawHalo(map: MapboxMap, ring: [number, number][]) {
  try {
    const data = { type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [ring] }, properties: {} };
    const src = map.getSource("radius-halo") as { setData?: (d: unknown) => void } | undefined;
    if (src?.setData) src.setData(data);
    else {
      map.addSource("radius-halo", { type: "geojson", data });
      map.addLayer({ id: "radius-halo-fill", type: "fill", source: "radius-halo", paint: { "fill-color": "#E8935E", "fill-opacity": 0.08 } });
      map.addLayer({
        id: "radius-halo-line",
        type: "line",
        source: "radius-halo",
        paint: { "line-color": "#D97E45", "line-opacity": 0.55, "line-width": 1.5, "line-dasharray": [2, 2] },
      });
    }
  } catch {
    /* style mid-swap — the style.load handler redraws */
  }
}

export function CourtsMap({
  token,
  courts,
  origin,
  radiusMi,
  originLabel,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}: {
  token: string | null;
  courts: FinderCourt[];
  origin: { lat: number; lng: number } | null;
  radiusMi: number;
  originLabel: string;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mbRef = useRef<(typeof import("mapbox-gl"))["default"] | null>(null);
  const markersRef = useRef<Map<string, { marker: Marker; el: HTMLDivElement; inner: HTMLDivElement }>>(new Map());
  const originMarkerRef = useRef<Marker | null>(null);
  const haloStateRef = useRef<{ lat: number; lng: number; r: number } | null>(null);
  const satelliteRef = useRef(false);
  const haloAnimRef = useRef<number | null>(null);
  const haloRadiusRef = useRef<number>(radiusMi);
  const [ready, setReady] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [callout, setCallout] = useState<{ x: number; y: number; court: FinderCourt } | null>(null);

  // ── init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !containerRef.current) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mbRef.current = mapboxgl;
      mapboxgl.accessToken = token;
      let map: MapboxMap;
      try {
        map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/light-v11",
          center: origin ? [origin.lng, origin.lat] : FALLBACK,
          zoom: 11,
          attributionControl: false,
        });
      } catch (err) {
        console.warn("[courts map] init failed", err);
        return;
      }
      map.on("error", (e: { error?: { status?: number; message?: string } }) => {
        console.warn("[courts map] tile/style error", e?.error?.status ?? "", e?.error?.message ?? "");
      });
      map.on("style.load", () => {
        applyDaylight(map);
        const h = haloStateRef.current;
        if (h && !satelliteRef.current) drawHalo(map, circleRing(h.lat, h.lng, h.r));
      });
      map.on("load", () => {
        if (cancelled) return;
        mapRef.current = map;
        setReady(true);
        map.resize();
        requestAnimationFrame(() => map.resize());
      });
      if (containerRef.current && "ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(containerRef.current);
      }
    })();
    const markers = markersRef.current;
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (haloAnimRef.current) cancelAnimationFrame(haloAnimRef.current);
      markers.forEach((m) => m.marker.remove());
      markers.clear();
      originMarkerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);


  // ── radius halo (tweened) + origin dot ─────────────────────────────────
  useEffect(() => {
    satelliteRef.current = satellite;
    const map = mapRef.current;
    const mapboxgl = mbRef.current;
    if (!ready || !map || !mapboxgl || !origin) return;
    haloStateRef.current = { lat: origin.lat, lng: origin.lng, r: radiusMi };

    if (!satellite && map.isStyleLoaded()) {
      const from = haloRadiusRef.current;
      const to = radiusMi;
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (haloAnimRef.current) cancelAnimationFrame(haloAnimRef.current);
      if (reduced || from === to || !map.getSource("radius-halo")) {
        drawHalo(map, circleRing(origin.lat, origin.lng, to));
        haloRadiusRef.current = to;
      } else {
        const t0 = performance.now();
        const step = (t: number) => {
          const k = Math.min(1, (t - t0) / 300);
          const eased = 1 - Math.pow(1 - k, 3);
          drawHalo(map, circleRing(origin.lat, origin.lng, from + (to - from) * eased));
          if (k < 1) haloAnimRef.current = requestAnimationFrame(step);
          else haloRadiusRef.current = to;
        };
        haloAnimRef.current = requestAnimationFrame(step);
      }
    }

    if (!originMarkerRef.current) {
      const dot = document.createElement("div");
      dot.style.cssText =
        "width:14px;height:14px;border-radius:9999px;background:#2E77C9;border:3px solid #fff;box-shadow:0 1px 4px rgba(20,40,80,.4)";
      originMarkerRef.current = new mapboxgl.Marker({ element: dot, anchor: "center" }).setLngLat([origin.lng, origin.lat]).addTo(map);
    } else {
      originMarkerRef.current.setLngLat([origin.lng, origin.lat]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, origin?.lat, origin?.lng, radiusMi, satellite]);

  // ── numbered pins ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mbRef.current;
    if (!ready || !map || !mapboxgl) return;

    markersRef.current.forEach((m) => m.marker.remove());
    markersRef.current.clear();

    const bounds = new mapboxgl.LngLatBounds();
    if (origin) bounds.extend([origin.lng, origin.lat]);

    courts.forEach((c, i) => {
      // Mapbox positions the ROOT via inline transform every frame — the root
      // must stay untouched (no position/transform/transition overrides, ever;
      // that exact mistake once piled every pin on the container's left edge).
      const el = document.createElement("div");
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `${i + 1}. ${c.name}`);
      el.style.cssText = "width:30px;height:38px;cursor:pointer";
      const inner = document.createElement("div");
      inner.style.cssText = "position:absolute;inset:0;transform-origin:50% 100%;transition:transform .15s ease";
      inner.innerHTML =
        `<svg width="30" height="38" viewBox="0 0 30 38" style="position:absolute;inset:0;filter:drop-shadow(0 2px 4px rgba(30,26,20,.35))">` +
        `<path d="M15 37C15 37 28 22.5 28 14A13 13 0 1 0 2 14C2 22.5 15 37 15 37Z" fill="#1E1A14" stroke="#fff" stroke-width="2.5"/></svg>` +
        `<span style="position:absolute;top:4.5px;left:0;right:0;text-align:center;font:700 12px 'JetBrains Mono',ui-monospace,monospace;color:#fff">${i + 1}</span>` +
        (c.liveQueue
          ? `<span style="position:absolute;right:-1px;top:-1px;width:9px;height:9px;border-radius:9999px;background:#2FA44F;border:2px solid #fff;animation:pulse 2s infinite"></span>`
          : "");
      el.appendChild(inner);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect(c.id);
      });
      el.addEventListener("mouseenter", () => onHover(c.id));
      el.addEventListener("mouseleave", () => onHover(null));
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([c.lng, c.lat]).addTo(map);
      markersRef.current.set(c.id, { marker, el, inner });
      bounds.extend([c.lng, c.lat]);
    });

    if (courts.length || origin) {
      if (courts.length <= 1 && origin) map.flyTo({ center: [origin.lng, origin.lat], zoom: 12, duration: 500 });
      else map.fitBounds(bounds, { padding: 64, maxZoom: 13.5, duration: 500 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courts, ready, origin?.lat, origin?.lng]);

  // ── cross-highlight + selected callout ─────────────────────────────────
  useEffect(() => {
    markersRef.current.forEach(({ el, inner }, id) => {
      const lift = id === selectedId || id === hoveredId;
      inner.style.transform = lift ? "scale(1.22)" : "scale(1)";
      el.style.zIndex = lift ? "5" : "1";
    });
  }, [selectedId, hoveredId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const place = () => {
      const c = courts.find((x) => x.id === selectedId);
      if (!c) {
        setCallout(null);
        return;
      }
      const p = map.project([c.lng, c.lat]);
      setCallout({ x: p.x, y: p.y, court: c });
    };
    const sel = courts.find((x) => x.id === selectedId);
    if (sel && !map.getBounds()?.contains([sel.lng, sel.lat])) {
      map.easeTo({ center: [sel.lng, sel.lat], duration: 450 });
    }
    place();
    map.on("move", place);
    return () => {
      map.off("move", place);
    };
  }, [selectedId, courts, ready]);

  if (!token) {
    return (
      <div className="grid h-[560px] place-items-center rounded-2xl border border-dashed border-rule bg-surface text-center min-[900px]:h-[652px]">
        <div className="px-6">
          <div className="text-sm font-semibold text-ink">Map view</div>
          <p className="mx-auto mt-1 max-w-xs text-xs text-mute">The interactive map turns on once a Mapbox token is added. The court list works either way.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[520px] overflow-hidden rounded-2xl border border-rule shadow-e1 min-[900px]:h-[652px]">
      <div ref={containerRef} className="absolute inset-0" />

      {/* controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button type="button" title="Zoom in" onClick={() => mapRef.current?.zoomIn()} className="press grid h-9 w-9 place-items-center rounded-[10px] border border-rule-2 bg-surface text-sm font-bold text-ink shadow-e1 hover:bg-hover">
          +
        </button>
        <button type="button" title="Zoom out" onClick={() => mapRef.current?.zoomOut()} className="press grid h-9 w-9 place-items-center rounded-[10px] border border-rule-2 bg-surface text-sm font-bold text-ink shadow-e1 hover:bg-hover">
          −
        </button>
        <button
          type="button"
          title="Recenter"
          onClick={() => {
            if (origin) mapRef.current?.flyTo({ center: [origin.lng, origin.lat], zoom: 11.5 });
          }}
          className="press grid h-9 w-9 place-items-center rounded-[10px] border border-rule-2 bg-surface text-sm font-bold text-ink shadow-e1 hover:bg-hover"
        >
          ◎
        </button>
        <button
          type="button"
          title={satellite ? "Streets" : "Satellite"}
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            const next = !satellite;
            setSatellite(next);
            map.setStyle(next ? "mapbox://styles/mapbox/satellite-streets-v12" : "mapbox://styles/mapbox/light-v11");
          }}
          className="press grid h-9 w-9 place-items-center rounded-[10px] border border-rule-2 bg-surface text-sm font-bold text-ink shadow-e1 hover:bg-hover"
        >
          ▤
        </button>
      </div>

      {/* legend + radius badge */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 rounded-[10px] border border-rule-2 bg-surface/95 px-3 py-1.5 font-mono text-[9px] font-semibold tracking-[0.1em] text-mute shadow-e1">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink" /> COURT</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#2FA44F]" /> LIVE QUEUE</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#3B82C4]" /> YOU</span>
      </div>
      {origin ? (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-[10px] border border-rule-2 bg-surface/95 px-2.5 py-1.5 font-mono text-[9px] font-semibold tracking-[0.1em] text-mute shadow-e1">
          {radiusMi} MI RADIUS{originLabel ? ` · ${originLabel.toUpperCase()}` : ""}
        </div>
      ) : null}

      {/* selected callout */}
      {callout ? (
        <div
          className="pointer-events-none absolute z-10 w-52 -translate-x-1/2 rounded-xl border border-rule-2 bg-surface p-2.5 shadow-e3"
          style={{ left: callout.x, top: Math.max(8, callout.y - 108) }}
        >
          <p className="truncate text-[12.5px] font-bold text-ink">{callout.court.name}</p>
          <p className="mt-0.5 font-mono text-[9px] tracking-[0.1em] text-faint">
            {callout.court.distanceMi} MI
            {callout.court.courtCount ? ` · ${callout.court.courtCount} COURTS` : ""}
            {(callout.court.memberRating ?? callout.court.googleRating) != null
              ? ` · ★ ${(callout.court.memberRating ?? callout.court.googleRating)!.toFixed(1)}`
              : ""}
          </p>
          <span className="pointer-events-auto mt-1.5 inline-block">
            <a href={`/courts/${callout.court.id}`} className="text-[11px] font-bold text-brand-deep">View court →</a>
          </span>
        </div>
      ) : null}
    </div>
  );
}
