"use client";

import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Navigation } from "lucide-react";
import type { FinderCourt } from "./courts-finder";

const FALLBACK: [number, number] = [-118.44, 34.02];

/* ── Daylight recolor: per-layer isolation so one incompatible paint property
   can never abort the pass (that failure once shipped a stock-looking map) ── */
function applyDaylight(map: MapboxMap) {
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    const id = layer.id;
    try {
      if (/poi|transit/.test(id) && layer.type === "symbol") {
        map.setLayoutProperty(id, "visibility", "none");
        continue;
      }
      if (layer.type === "background") {
        map.setPaintProperty(id, "background-color", "#F5F1E6");
        continue;
      }
      if (layer.type === "fill" && /water|ocean|sea/.test(id)) {
        map.setPaintProperty(id, "fill-color", "#CFE3F2");
        continue;
      }
      if (layer.type === "line" && /waterway|shoreline/.test(id)) {
        map.setPaintProperty(id, "line-color", "#B9D3E8");
        continue;
      }
      if (layer.type === "fill" && /landuse|landcover|park|pitch|grass|golf|cemetery/.test(id)) {
        map.setPaintProperty(id, "fill-color", "#E1EBD6");
        continue;
      }
      if (layer.type === "fill" && /land-structure|building/.test(id)) {
        map.setPaintProperty(id, "fill-color", "#EDE8DB");
        continue;
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
  const readyRef = useRef(false);
  const stageRef = useRef("waiting for token/container");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [debugOn, setDebugOn] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [callout, setCallout] = useState<{ x: number; y: number; court: FinderCourt } | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (window.location.search.includes("mapdebug")) setDebugOn(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const log = (line: string) => {
    stageRef.current = line;
    const t = new Date();
    const stamped = `${t.toLocaleTimeString("en-US", { hour12: false })}.${String(t.getMilliseconds()).padStart(3, "0")} ${line}`;
    console.warn("[courts map]", line);
    setLogLines((prev) => [...prev.slice(-13), stamped]);
  };

  // ── init: a failure must be VISIBLE, never a silent blank canvas ─────────
  useEffect(() => {
    if (!token || !containerRef.current) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const watchdog = setTimeout(() => {
      if (!cancelled && !readyRef.current) {
        setMapError((e) => e ?? `The map stalled at "${stageRef.current}" — check that the Mapbox token is a public pk. token and its URL restrictions include this domain.`);
      }
    }, 8000);
    log("importing map library");
    (async () => {
      let mapboxgl: (typeof import("mapbox-gl"))["default"];
      try {
        mapboxgl = (await import("mapbox-gl")).default;
        log("library loaded");
      } catch {
        if (!cancelled) setMapError("The map library failed to load.");
        return;
      }
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
          attributionControl: true,
        });
        log("map constructed — loading style");
      } catch (err) {
        if (!cancelled) setMapError(err instanceof Error ? err.message : "The map couldn't start.");
        return;
      }
      map.on("error", (e: { error?: { status?: number; message?: string } }) => {
        const msg = e?.error?.message ?? "";
        const status = e?.error?.status;
        log(`ERROR${status ? ` ${status}` : ""}: ${msg || "unknown"}`);
        // Any error while the canvas is blank is worth showing — a technical
        // banner beats a silent blank, and healthy maps fire none.
        setMapError((prev) => prev ?? `Map error${status ? ` (${status})` : ""}: ${msg || "unknown — see ?mapdebug=1"}`);
      });
      map.on("style.load", () => {
        log("style loaded — recoloring");
        applyDaylight(map);
        const h = haloStateRef.current;
        if (h && !satelliteRef.current) drawHalo(map, circleRing(h.lat, h.lng, h.r));
      });
      map.on("load", () => {
        if (cancelled) return;
        log("map ready");
        const probeGeometry = (tag: string) => {
          try {
            const cv = map.getCanvas();
            const cs = window.getComputedStyle(cv);
            const box = cv.getBoundingClientRect();
            const cont = containerRef.current;
            log(`[${tag}] canvas attr ${cv.width}×${cv.height} · css ${Math.round(box.width)}×${Math.round(box.height)} · display:${cs.display} vis:${cs.visibility} op:${cs.opacity}`);
            log(`[${tag}] container ${cont?.clientWidth ?? "?"}×${cont?.clientHeight ?? "?"} · sameNode:${map.getContainer() === cont} · markers:${markersRef.current.size}`);
            if (box.width < 10 || box.height < 10) {
              log(`[${tag}] canvas degenerate — forcing resize`);
              map.resize();
            }
          } catch (e) {
            log(`[${tag}] geometry probe failed: ${e instanceof Error ? e.message : "?"}`);
          }
        };
        probeGeometry("ready");
        map.once("idle", () => {
          log("idle — first full render complete");
          probeGeometry("idle");
        });
        setTimeout(() => probeGeometry("t+2.5s"), 2500);
        mapRef.current = map;
        readyRef.current = true;
        setReady(true);
        setMapError(null);
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
      clearTimeout(watchdog);
      resizeObserver?.disconnect();
      if (haloAnimRef.current) cancelAnimationFrame(haloAnimRef.current);
      markers.forEach((m) => m.marker.remove());
      markers.clear();
      originMarkerRef.current?.remove();
      originMarkerRef.current = null;
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

  // ── numbered pins: the marker ROOT belongs to Mapbox (width/height/cursor
  //    only) — every visual lives on the inner wrapper ─────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mbRef.current;
    if (!ready || !map || !mapboxgl) return;

    markersRef.current.forEach((m) => m.marker.remove());
    markersRef.current.clear();

    const bounds = new mapboxgl.LngLatBounds();
    if (origin) bounds.extend([origin.lng, origin.lat]);

    courts.forEach((c, i) => {
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
          ? `<span style="position:absolute;right:-1px;top:-1px;width:9px;height:9px;border-radius:9999px;background:#2FA44F;border:2px solid #fff"></span>`
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

  // ── cross-highlight: scale the INNER; z-index is the only safe root write ─
  useEffect(() => {
    markersRef.current.forEach(({ el, inner }, id) => {
      const lift = id === selectedId || id === hoveredId;
      inner.style.transform = lift ? "scale(1.22)" : "scale(1)";
      el.style.zIndex = lift ? "5" : "1";
    });
  }, [selectedId, hoveredId]);

  // ── selected callout: re-projects on every move; pans off-screen pins in ─
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
      <div className="grid h-[520px] place-items-center rounded-2xl border border-dashed border-rule bg-surface text-center min-[900px]:h-[652px]">
        <div className="px-6">
          <div className="text-sm font-semibold text-ink">Map view</div>
          <p className="mx-auto mt-1 max-w-xs text-xs text-mute">The interactive map turns on once a Mapbox token is added. The court list works either way.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[520px] overflow-hidden rounded-2xl border border-[#E3E5D8] shadow-e1 min-[900px]:h-[652px]">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      {debugOn ? (
        <div className="absolute inset-x-3 bottom-14 z-30 max-h-44 overflow-y-auto rounded-lg bg-ink/90 p-2.5 font-mono text-[9.5px] leading-relaxed text-white/90">
          <p className="mb-1 font-bold text-white">MAP DEBUG v2 (geometry probe) — token {token ? `${token.slice(0, 6)}…${token.slice(-4)} (${token.startsWith("pk.") ? "public ✓" : "NOT a pk. public token ✗"})` : "MISSING"}</p>
          {logLines.map((l, i) => (
            <p key={i} className="break-all">{l}</p>
          ))}
        </div>
      ) : null}

      {mapError ? (
        <div className="pointer-events-none absolute inset-x-4 top-4 z-20 rounded-xl border border-danger/30 bg-[#FDECEA]/95 px-3.5 py-2.5 text-center">
          <p className="text-xs font-semibold text-danger">{mapError}</p>
        </div>
      ) : null}

      {/* controls */}
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
        <button type="button" title="Zoom in" onClick={() => mapRef.current?.zoomIn()} className="press grid h-9 w-9 place-items-center rounded-[10px] border border-rule-2 bg-surface/95 text-sm font-bold text-ink shadow-e1 backdrop-blur hover:bg-hover">
          +
        </button>
        <button type="button" title="Zoom out" onClick={() => mapRef.current?.zoomOut()} className="press grid h-9 w-9 place-items-center rounded-[10px] border border-rule-2 bg-surface/95 text-sm font-bold text-ink shadow-e1 backdrop-blur hover:bg-hover">
          −
        </button>
        <button
          type="button"
          title="Recenter"
          onClick={() => {
            if (origin) mapRef.current?.flyTo({ center: [origin.lng, origin.lat], zoom: 11.5 });
          }}
          className="press grid h-9 w-9 place-items-center rounded-[10px] border border-rule-2 bg-surface/95 text-sm font-bold text-brand shadow-e1 backdrop-blur hover:bg-hover"
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
          className="press grid h-9 w-9 place-items-center rounded-[10px] border border-rule-2 bg-surface/95 text-sm font-bold text-ink shadow-e1 backdrop-blur hover:bg-hover"
        >
          ▤
        </button>
      </div>

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
          <div className="pointer-events-auto mt-2 flex items-center gap-1.5">
            <Link
              href={`/courts/${callout.court.id}`}
              className="press inline-flex h-7 flex-1 items-center justify-center rounded-lg bg-brand text-[11px] font-bold text-white hover:bg-[#E23E0D]"
            >
              View court
            </Link>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${callout.court.lat},${callout.court.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Directions"
              className="press grid h-7 w-8 place-items-center rounded-lg border border-rule-2 bg-surface text-ink hover:bg-hover"
            >
              <Navigation size={12} />
            </a>
          </div>
        </div>
      ) : null}

      {/* legend + radius badge */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-[10px] border border-rule-2 bg-surface/95 px-3 py-1.5 font-mono text-[9px] font-semibold tracking-[0.1em] text-mute shadow-e1 backdrop-blur">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink" /> COURT</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#2FA44F]" /> LIVE QUEUE</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#2E77C9]" /> YOU</span>
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-[10px] border border-rule-2 bg-surface/95 px-3 py-1.5 font-mono text-[9px] font-semibold tracking-[0.1em] text-mute shadow-e1 backdrop-blur">
        {radiusMi} MI RADIUS · {originLabel}
      </div>
    </div>
  );
}
