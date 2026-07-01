import { MapPin, ExternalLink } from "lucide-react";
import type { LatLng } from "@/lib/maps-url";

// A compact map card for the public event page. The iframe is the keyless Google
// Maps embed (q + output=embed), which needs no API key and is frame-friendly. A
// transparent anchor sits on top so a click anywhere opens the full Google Maps
// page (with the exact place when we have a place_id) in a new tab — and if the
// embed is ever unavailable, the card still shows the venue and stays clickable.
export function EventLocationMap({
  name,
  address,
  zip,
  lat,
  lng,
  point,
  placeId,
  href,
  className,
}: {
  name: string | null;
  address: string | null;
  zip?: string | null;
  lat: number | null;
  lng: number | null;
  // A precise coordinate (e.g. resolved from the organizer's pasted Maps link).
  // When present it wins over the address text so the pin lands exactly.
  point?: LatLng | null;
  placeId?: string | null;
  href?: string;
  className?: string;
}) {
  const label = (name ?? "").trim();
  const addr = (address ?? "").trim();
  const zipCode = (zip ?? "").trim();
  const precise = point && Number.isFinite(point.lat) && Number.isFinite(point.lng) ? point : null;
  // Precise coordinate first (exact pin), then the street address the organizer
  // entered plus ZIP, then the venue name, then any stored (centroid) lat/lng.
  const base = addr || label;
  const query = precise
    ? `${precise.lat},${precise.lng}`
    : base
      ? zipCode
        ? `${base}, ${zipCode}`
        : base
      : lat != null && lng != null
        ? `${lat},${lng}`
        : "";
  if (!query) return null;

  const zoom = precise ? 16 : 14;
  const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`;
  const mapsHref = href || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${placeId ? `&query_place_id=${encodeURIComponent(placeId)}` : ""}`;
  const caption = label || addr || "Venue";

  return (
    <div className={`relative h-full min-h-[170px] overflow-hidden rounded-3xl border border-rule bg-surface ${className ?? ""}`}>
      <iframe
        src={embedSrc}
        title={`Map showing ${caption}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 h-full w-full border-0"
      />
      <a
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${caption} in Google Maps (new tab)`}
        className="group absolute inset-0 flex flex-col justify-between p-3"
      >
        <span className="pointer-events-none inline-flex items-center gap-1 self-end rounded-full bg-ink/85 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur transition group-hover:bg-ink">
          Google Maps <ExternalLink size={11} />
        </span>
        <span className="pointer-events-none inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-surface/95 px-3 py-1.5 text-xs font-semibold text-ink shadow-sm ring-1 ring-rule backdrop-blur">
          <MapPin size={13} className="shrink-0 text-brand-deep" />
          <span className="truncate">{caption}</span>
        </span>
      </a>
    </div>
  );
}
