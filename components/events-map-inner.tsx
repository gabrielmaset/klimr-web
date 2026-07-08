"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, Circle, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { sportMeta } from "@/lib/sports";
import type { CardEvent } from "@/components/events-browser";

const flamePin = L.divIcon({
  className: "",
  html: '<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:9999px;background:#fff;border:2.5px solid #E23E0D;box-shadow:0 4px 10px -4px rgba(214,58,15,.55)"><span style="width:9px;height:9px;border-radius:9999px;background:linear-gradient(140deg,#FF6A35,#E23E0D)"></span></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -14],
});

function FitBounds({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!pts.length) return;
    if (pts.length === 1) map.setView(pts[0], 12);
    else map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 13 });
  }, [map, pts]);
  return null;
}

export default function EventsMapInner({ events, userLoc, radiusMi }: { events: CardEvent[]; userLoc: { lat: number; lng: number } | null; radiusMi: number | null }) {
  const pins = useMemo(() => events.filter((e) => e.lat != null && e.lng != null), [events]);
  const pts = useMemo<[number, number][]>(() => {
    const p: [number, number][] = pins.map((e) => [e.lat as number, e.lng as number]);
    if (userLoc) p.push([userLoc.lat, userLoc.lng]);
    return p;
  }, [pins, userLoc]);

  return (
    <MapContainer center={pts[0] ?? [34.0522, -118.2437]} zoom={11} scrollWheelZoom={false} className="h-full w-full" attributionControl>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitBounds pts={pts} />
      {userLoc ? (
        <>
          <CircleMarker center={[userLoc.lat, userLoc.lng]} radius={7} pathOptions={{ color: "#fff", weight: 2.5, fillColor: "#2E90FA", fillOpacity: 1 }} />
          {radiusMi ? <Circle center={[userLoc.lat, userLoc.lng]} radius={radiusMi * 1609.34} pathOptions={{ color: "#E23E0D", weight: 1.5, dashArray: "4 6", fillColor: "#FF6A35", fillOpacity: 0.06 }} /> : null}
        </>
      ) : null}
      {pins.map((e) => (
        <Marker key={e.id} position={[e.lat as number, e.lng as number]} icon={flamePin}>
          <Popup>
            <span style={{ display: "block", minWidth: 180, fontFamily: "var(--font-sans)" }}>
              <span style={{ display: "block", fontWeight: 700, fontSize: 13.5, color: "#201B12" }}>
                {sportMeta(e.sportKey).emoji} {e.title}
              </span>
              <span style={{ display: "block", marginTop: 2, fontSize: 11.5, color: "#6E6555" }}>
                {e.venue ?? "Location TBA"} · {new Date(e.whenIso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
              <Link href={`/events/${e.id}`} style={{ display: "inline-block", marginTop: 6, fontSize: 12, fontWeight: 700, color: "#C2410C" }}>
                Open event →
              </Link>
            </span>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
