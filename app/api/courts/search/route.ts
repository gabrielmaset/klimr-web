import { NextResponse } from "next/server";
import { searchCourts } from "@/app/courts/search-actions";

/** Live court search over a ROUTE HANDLER, not a server action — Next.js
 *  queues navigations behind in-flight server actions, which made the whole
 *  left menu feel stuck whenever a search was running. Plain fetches never
 *  block the router: searches and navigation are now fully decoupled.
 *  (searchCourts itself still auth-guards, caps, caches, and verifies.) */
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    locationKey?: unknown;
    radiusKm?: unknown;
    sport?: unknown;
    lat?: unknown;
    lng?: unknown;
  } | null;
  const result = await searchCourts({
    locationKey: String(body?.locationKey ?? ""),
    radiusKm: Number(body?.radiusKm ?? 16),
    sport: String(body?.sport ?? ""),
    ...(Number.isFinite(Number(body?.lat)) && Number.isFinite(Number(body?.lng))
      ? { lat: Number(body?.lat), lng: Number(body?.lng) }
      : {}),
  });
  return NextResponse.json(result);
}
