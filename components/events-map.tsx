"use client";

import { useEffect, useRef } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import { sportMeta } from "@/lib/sports";
import { reportClientError } from "@/lib/client-diagnostics";
import type { CardEvent } from "@/components/events-browser";

// Westside LA fallback center (matches the courts map).
const FALLBACK: [number, number] = [-118.4309, 34.0119];

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** 72-point circle polygon (miles) for the proximity ring. */
function circleGeoJSON(lng: number, lat: number, miles: number) {
  const coords: [number, number][] = [];
  const distX = miles / (69.172 * Math.cos((lat * Math.PI) / 180));
  const distY = miles / 68.972;
  for (let i = 0; i <= 72; i++) {
    const theta = (i / 72) * 2 * Math.PI;
    coords.push([lng + distX * Math.cos(theta), lat + distY * Math.sin(theta)]);
  }
  return { type: "Feature" as const, geometry: { type: "Polygon" as const, coordinates: [coords] }, properties: {} };
}

export function EventsMap({
  token,
  events,
  center,
  centerLabel,
  radiusMi,
}: {
  token: string | null;
  events: CardEvent[];
  center: { lat: number; lng: number } | null;
  centerLabel: string | null;
  radiusMi: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const centerMarkerRef = useRef<Marker | null>(null);
  const mbRef = useRef<(typeof import("mapbox-gl"))["default"] | null>(null);
  const loadedRef = useRef(false);

  // Init once (client-only dynamic import keeps mapbox-gl out of SSR).
  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;
    let cancelled = false;
    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mbRef.current = mapboxgl;
      mapboxgl.accessToken = token;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: FALLBACK,
        zoom: 10.5,
        attributionControl: true,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        loadedRef.current = true;
        map.addSource("near-ring", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "near-ring-fill", type: "fill", source: "near-ring", paint: { "fill-color": "#FF6A35", "fill-opacity": 0.05 } });
        map.addLayer({ id: "near-ring-line", type: "line", source: "near-ring", paint: { "line-color": "#E23E0D", "line-width": 1.5, "line-dasharray": [1.5, 2.5] } });
        map.resize();
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, [token]);

  // Pins + center + ring + bounds — refresh whenever inputs change.
  useEffect(() => {
    const map = mapRef.current;
    const mapboxgl = mbRef.current;
    if (!map || !mapboxgl) return;

    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    centerMarkerRef.current?.remove();
    centerMarkerRef.current = null;

    const bounds = new mapboxgl.LngLatBounds();
    let hasPoint = false;

    for (const e of events) {
      if (e.lat == null || e.lng == null) continue;
      const el = document.createElement("div");
      el.style.cssText =
        "display:grid;place-items:center;width:26px;height:26px;border-radius:9999px;background:#fff;border:2.5px solid #E23E0D;box-shadow:0 4px 10px -4px rgba(214,58,15,.55);cursor:pointer";
      const dot = document.createElement("span");
      dot.style.cssText = "width:9px;height:9px;border-radius:9999px;background:linear-gradient(140deg,#FF6A35,#E23E0D)";
      el.appendChild(dot);
      const when = new Date(e.whenIso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const popup = new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(
        `<div style="font:700 13.5px var(--font-sans),system-ui,sans-serif;color:#201B12">${sportMeta(e.sportKey).emoji} ${escapeHtml(e.title)}</div>` +
          `<div style="font:500 11.5px var(--font-sans),system-ui,sans-serif;color:#6E6555;margin-top:2px">${escapeHtml(e.venue ?? "Location TBA")} · ${when}</div>` +
          `<a href="/events/${e.id}" style="font:700 12px var(--font-sans),system-ui,sans-serif;color:#C2410C;margin-top:6px;display:inline-block;text-decoration:none">Open event →</a>`,
      );
      const marker = new mapboxgl.Marker(el).setLngLat([e.lng, e.lat]).setPopup(popup).addTo(map);
      markersRef.current.push(marker);
      bounds.extend([e.lng, e.lat]);
      hasPoint = true;
    }

    if (center) {
      const el = document.createElement("div");
      el.title = centerLabel ?? "Search center";
      el.style.cssText =
        "width:16px;height:16px;border-radius:9999px;background:#2E90FA;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)";
      centerMarkerRef.current = new mapboxgl.Marker(el).setLngLat([center.lng, center.lat]).addTo(map);
      bounds.extend([center.lng, center.lat]);
      hasPoint = true;
    }

    const applyRing = () => {
      const src = map.getSource("near-ring") as import("mapbox-gl").GeoJSONSource | undefined;
      if (!src) return;
      src.setData(
        center && radiusMi
          ? { type: "FeatureCollection", features: [circleGeoJSON(center.lng, center.lat, radiusMi)] }
          : { type: "FeatureCollection", features: [] },
      );
    };
    if (loadedRef.current) applyRing();
    else map.once("load", applyRing);

    if (center && radiusMi) {
      map.fitBounds(
        [
          [center.lng - radiusMi / (69.172 * Math.cos((center.lat * Math.PI) / 180)), center.lat - radiusMi / 68.972],
          [center.lng + radiusMi / (69.172 * Math.cos((center.lat * Math.PI) / 180)), center.lat + radiusMi / 68.972],
        ],
        { padding: 36, duration: 500 },
      );
    } else if (hasPoint) {
      map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 500 });
    }
  }, [events, center, centerLabel, radiusMi]);

  useEffect(() => {
    if (!token) reportClientError({ message: "Events map: NEXT_PUBLIC_MAPBOX_TOKEN missing", userMessage: "Map unavailable \u2014 NEXT_PUBLIC_MAPBOX_TOKEN isn\u2019t set." });
  }, [token]);

  if (!token) {
    return (
      <div className="grid h-full w-full place-items-center bg-bg px-6 text-center text-xs font-semibold text-faint">
        Map unavailable — NEXT_PUBLIC_MAPBOX_TOKEN isn&rsquo;t set.
      </div>
    );
  }
  return <div ref={containerRef} className="h-full w-full" />;
}
