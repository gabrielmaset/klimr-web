import { Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning, Droplets, Wind } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EventForecast, WeatherKind } from "@/lib/weather";

// Each condition gets a gradient + an icon so the card reads at a glance.
const THEME: Record<WeatherKind, { grad: string; Icon: LucideIcon }> = {
  clear: { grad: "linear-gradient(135deg,#38bdf8,#0284c7)", Icon: Sun },
  partly: { grad: "linear-gradient(135deg,#60a5fa,#2563eb)", Icon: CloudSun },
  cloudy: { grad: "linear-gradient(135deg,#94a3b8,#475569)", Icon: Cloud },
  fog: { grad: "linear-gradient(135deg,#9ca3af,#6b7280)", Icon: CloudFog },
  drizzle: { grad: "linear-gradient(135deg,#60a5fa,#1d4ed8)", Icon: CloudDrizzle },
  rain: { grad: "linear-gradient(135deg,#3b82f6,#1e3a8a)", Icon: CloudRain },
  snow: { grad: "linear-gradient(135deg,#7dd3fc,#38bdf8)", Icon: CloudSnow },
  thunder: { grad: "linear-gradient(135deg,#6366f1,#3730a3)", Icon: CloudLightning },
};

export function WeatherForecastCard({
  forecast,
  dateText,
  locationName,
  className,
}: {
  forecast: EventForecast;
  dateText?: string | null;
  locationName?: string | null;
  className?: string;
}) {
  const { grad, Icon } = THEME[forecast.kind];
  return (
    <div className={`relative overflow-hidden rounded-3xl p-5 text-white sm:p-6 ${className ?? ""}`} style={{ backgroundImage: grad }}>
      <Icon aria-hidden size={150} strokeWidth={1.5} className="pointer-events-none absolute -right-6 -top-8 text-white/20" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="kicker text-white/75">Forecast{dateText ? ` · ${dateText}` : ""}</p>
            <p className="mt-0.5 text-lg font-bold leading-tight">{forecast.label}</p>
            {locationName ? <p className="truncate text-sm text-white/80">{locationName}</p> : null}
          </div>
          <Icon aria-hidden size={36} strokeWidth={1.75} className="shrink-0 text-white/90" />
        </div>
        <div className="mt-4 flex items-end gap-2.5">
          <span className="text-4xl font-bold leading-none">{forecast.tempMaxF}°</span>
          <span className="pb-1 text-sm text-white/80">/ {forecast.tempMinF}° low</span>
        </div>
        {forecast.precipProb != null || forecast.windMaxMph != null ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            {forecast.precipProb != null ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1">
                <Droplets size={12} /> {forecast.precipProb}% precip
              </span>
            ) : null}
            {forecast.windMaxMph != null ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1">
                <Wind size={12} /> {forecast.windMaxMph} mph wind
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
