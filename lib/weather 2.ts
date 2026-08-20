import { unstable_cache } from "next/cache";

export type WeatherKind = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "thunder";

export type EventForecast = {
  date: string; // YYYY-MM-DD (venue-local)
  code: number; // WMO weather code
  kind: WeatherKind; // normalized for visuals
  label: string; // human-readable condition
  tempMaxF: number;
  tempMinF: number;
  precipProb: number | null; // %
  windMaxMph: number | null;
};

// WMO weather interpretation codes → a visual "kind" + a friendly label.
function classify(code: number): { kind: WeatherKind; label: string } {
  switch (code) {
    case 0: return { kind: "clear", label: "Clear sky" };
    case 1: return { kind: "clear", label: "Mainly clear" };
    case 2: return { kind: "partly", label: "Partly cloudy" };
    case 3: return { kind: "cloudy", label: "Overcast" };
    case 45:
    case 48: return { kind: "fog", label: "Fog" };
    case 51: return { kind: "drizzle", label: "Light drizzle" };
    case 53: return { kind: "drizzle", label: "Drizzle" };
    case 55: return { kind: "drizzle", label: "Heavy drizzle" };
    case 56:
    case 57: return { kind: "drizzle", label: "Freezing drizzle" };
    case 61: return { kind: "rain", label: "Light rain" };
    case 63: return { kind: "rain", label: "Rain" };
    case 65: return { kind: "rain", label: "Heavy rain" };
    case 66:
    case 67: return { kind: "rain", label: "Freezing rain" };
    case 71: return { kind: "snow", label: "Light snow" };
    case 73: return { kind: "snow", label: "Snow" };
    case 75: return { kind: "snow", label: "Heavy snow" };
    case 77: return { kind: "snow", label: "Snow grains" };
    case 80: return { kind: "rain", label: "Light showers" };
    case 81: return { kind: "rain", label: "Showers" };
    case 82: return { kind: "rain", label: "Heavy showers" };
    case 85:
    case 86: return { kind: "snow", label: "Snow showers" };
    case 95: return { kind: "thunder", label: "Thunderstorm" };
    case 96:
    case 99: return { kind: "thunder", label: "Thunderstorm with hail" };
    default: return { kind: "cloudy", label: "Cloudy" };
  }
}

const HORIZON_DAYS = 16; // Open-Meteo's free forecast reaches ~16 days out.
const DAY_MS = 86_400_000;

function ymd(d: Date, timeZone?: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
}

async function fetchForecastRaw(lat: number, lng: number, date: string): Promise<EventForecast | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&start_date=${date}&end_date=${date}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { daily?: Record<string, unknown[]> };
    const d = json?.daily;
    if (!d || !Array.isArray(d.time) || d.time.length === 0) return null;
    const code = Number(d.weather_code?.[0]);
    const tMax = Number(d.temperature_2m_max?.[0]);
    const tMin = Number(d.temperature_2m_min?.[0]);
    if (!Number.isFinite(code) || !Number.isFinite(tMax) || !Number.isFinite(tMin)) return null;
    const precip = Number(d.precipitation_probability_max?.[0]);
    const wind = Number(d.wind_speed_10m_max?.[0]);
    const { kind, label } = classify(code);
    return {
      date,
      code,
      kind,
      label,
      tempMaxF: Math.round(tMax),
      tempMinF: Math.round(tMin),
      precipProb: Number.isFinite(precip) ? Math.round(precip) : null,
      windMaxMph: Number.isFinite(wind) ? Math.round(wind) : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Cache per (lat, lng, date) so the forecast is fetched at most ~twice an hour
// even on dynamically-rendered pages.
const cachedForecast = unstable_cache(fetchForecastRaw, ["event-forecast-v1"], { revalidate: 1800 });

/**
 * Day-of forecast for an event venue from Open-Meteo (no API key required).
 * Returns null — so callers can simply skip rendering — when there are no
 * coordinates, no date, the date is in the past, the date is beyond the ~16-day
 * forecast horizon, or the request fails.
 */
export async function getEventForecast(opts: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  startsAt: string | null | undefined;
  timezone?: string | null;
}): Promise<EventForecast | null> {
  const { lat, lng, startsAt, timezone } = opts;
  if (lat == null || lng == null || !startsAt) return null;
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const diffDays = Math.floor(start.getTime() / DAY_MS) - Math.floor(Date.now() / DAY_MS);
  if (diffDays < 0 || diffDays > HORIZON_DAYS) return null;
  return cachedForecast(lat, lng, ymd(start, timezone));
}
