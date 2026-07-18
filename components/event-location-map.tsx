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
  // The keyless embed's TEXT geocoding is banned — it has dropped "Santa
  // Monica, CA" on a lane in Hampshire. The iframe renders only with a real
  // coordinate (resolved link, geocoded server-side, or stored court lat/lng);
  // otherwise the card stays a clean, honest "open in Google Maps" link.
  const coord = precise ?? (lat != null && lng != null ? { lat, lng } : null);
  const query = coord ? `${coord.lat},${coord.lng}` : base ? (zipCode ? `${base}, ${zipCode}` : base) : "";
  if (!query) return null;

  const embedSrc = coord ? `https://www.google.com/maps?q=${encodeURIComponent(`${coord.lat},${coord.lng}`)}&z=16&output=embed` : null;
  const mapsHref = href || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${placeId ? `&query_place_id=${encodeURIComponent(placeId)}` : ""}`;
  const caption = label || addr || "Venue";

  return (
    <div className={`relative h-full min-h-[170px] overflow-hidden rounded-3xl border border-rule bg-surface shadow-e1 ${className ?? ""}`}>
      {embedSrc ? <iframe
        src={embedSrc}
        title={`Map showing ${caption}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 h-full w-full border-0"
      /> : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-bg to-surface">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft"><MapPin size={16} className="text-brand-deep" /> Open in Google Maps</span>
        </div>
      )}
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
