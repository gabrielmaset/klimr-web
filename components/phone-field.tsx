"use client";

import { useState } from "react";

/** Professional phone field (Gabriel's spec): a country selector FIRST which
 *  sets the format of the number that follows. US (+1) is the only option for
 *  now; when more countries ship, each country entry carries its own mask and
 *  this component switches formats off the selection — the data model
 *  (profiles.phone_country + digits-only profiles.phone) already supports it.
 *
 *  Posts digits only via hidden inputs so server actions receive clean data;
 *  the visible input formats live as (###) ###-####. */

const COUNTRIES = [
  { code: "US", dial: "+1", label: "United States", digits: 10 },
] as const;

export function formatUsPhone(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  if (!d) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function PhoneField({
  defaultDigits = null,
  defaultCountry = "US",
  nameDigits = "phone",
  nameCountry = "phone_country",
  required = false,
  onDigitsChange,
}: {
  defaultDigits?: string | null;
  defaultCountry?: string | null;
  nameDigits?: string;
  nameCountry?: string;
  required?: boolean;
  onDigitsChange?: (digits: string) => void;
}) {
  const [country, setCountry] = useState((defaultCountry ?? "US").toUpperCase());
  const [digits, setDigits] = useState((defaultDigits ?? "").replace(/\D/g, "").slice(0, 10));
  const c = COUNTRIES.find((x) => x.code === country) ?? COUNTRIES[0];

  return (
    <div className="flex gap-2">
      <label className="sr-only" htmlFor={`${nameDigits}-country`}>
        Country
      </label>
      <select
        id={`${nameDigits}-country`}
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className="shrink-0 rounded-xl border border-rule-2 bg-surface px-2.5 py-3 text-[15px] text-ink outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/15"
        aria-label="Phone country"
      >
        {COUNTRIES.map((o) => (
          <option key={o.code} value={o.code}>
            {o.code} {o.dial}
          </option>
        ))}
      </select>
      <input
        value={formatUsPhone(digits)}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, "").slice(0, c.digits);
          setDigits(d);
          onDigitsChange?.(d);
        }}
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="(555) 123-4567"
        required={required}
        aria-label="Phone number"
        className="w-full rounded-xl border border-rule-2 bg-surface px-3.5 py-3 font-mono text-[16px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
      />
      <input type="hidden" name={nameDigits} value={digits} />
      <input type="hidden" name={nameCountry} value={country} />
    </div>
  );
}
