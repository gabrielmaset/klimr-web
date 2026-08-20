"use client";

import { useReportWebVitals } from "next/web-vitals";

/** Client half of RUM (K3-05). Reports Core Web Vitals for a 10% sample of
 *  page loads. Sampling is decided ONCE per page load rather than per metric,
 *  so a sampled session contributes a complete set — mixing partial metric sets
 *  would bias the percentiles it exists to measure. */
const SAMPLE_RATE = 0.1;
const sampled = () => Math.random() < SAMPLE_RATE;

let thisLoadSampled: boolean | null = null;

export function sendPerf(metric: string, value: number) {
  try {
    const body = JSON.stringify({
      metric,
      value,
      route: window.location.pathname,
      isMobile: window.matchMedia("(max-width: 767px)").matches,
    });
    // sendBeacon survives the page unload that often follows the final metric.
    if (navigator.sendBeacon) navigator.sendBeacon("/api/rum", new Blob([body], { type: "application/json" }));
    else void fetch("/api/rum", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
  } catch {
    /* telemetry must never break a page */
  }
}

export function WebVitals() {
  useReportWebVitals((metric) => {
    if (thisLoadSampled === null) thisLoadSampled = sampled();
    if (!thisLoadSampled) return;
    const name = metric.name.toLowerCase();
    if (!["lcp", "inp", "cls", "ttfb"].includes(name)) return;
    // CLS is a unitless ratio; ×1000 keeps every metric in one numeric column
    // without a second unit to reason about (the budget is scaled to match).
    sendPerf(name, name === "cls" ? metric.value * 1000 : metric.value);
  });
  return null;
}
