"use client";

import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/** Apple-style floating labels (Gabriel's ask, 2026-07-30), Klimr-skinned.
 *
 *  Mechanics — pure CSS, no state:
 *  - Empty + unfocused: the label sits INSIDE the field at value size, exactly
 *    where a placeholder would (`placeholder=" "` keeps :placeholder-shown
 *    truthful without painting anything).
 *  - Focused or filled: the label floats to the top edge and shrinks, so a
 *    filled field always shows what it holds.
 *  - Proportions match the reference: resting label = value size (text-sm);
 *    floated label ≈ 0.72× (text-[10.5px]), muted.
 *
 *  Selects always have a rendered value, so their label is permanently
 *  floated — same treatment Apple gives "City, State".
 */

const shell =
  "peer w-full rounded-[10px] border border-rule-2 bg-white px-3 pb-2 pt-[22px] text-sm text-ink outline-none transition-colors placeholder-transparent focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:bg-bg disabled:text-mute";

const floatLabel =
  "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint transition-all duration-150 " +
  "peer-focus:top-[13px] peer-focus:text-[10.5px] peer-focus:font-medium peer-focus:text-mute " +
  "peer-[:not(:placeholder-shown)]:top-[13px] peer-[:not(:placeholder-shown)]:text-[10.5px] peer-[:not(:placeholder-shown)]:font-medium peer-[:not(:placeholder-shown)]:text-mute";

export function FloatInput({
  label,
  id,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string }) {
  return (
    <div className={`relative ${className}`}>
      <input id={id} placeholder=" " className={shell} {...rest} />
      <label htmlFor={id} className={floatLabel}>
        {label}
      </label>
    </div>
  );
}

export function FloatTextarea({
  label,
  id,
  className = "",
  rows = 3,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string }) {
  return (
    <div className={`relative ${className}`}>
      <textarea id={id} rows={rows} placeholder=" " className={`${shell} resize-y`} {...rest} />
      <label
        htmlFor={id}
        className={
          // Multiline: the resting label anchors to the first line, not center.
          "pointer-events-none absolute left-3 top-[15px] text-sm text-faint transition-all duration-150 " +
          "peer-focus:top-[9px] peer-focus:text-[10.5px] peer-focus:font-medium peer-focus:text-mute " +
          "peer-[:not(:placeholder-shown)]:top-[9px] peer-[:not(:placeholder-shown)]:text-[10.5px] peer-[:not(:placeholder-shown)]:font-medium peer-[:not(:placeholder-shown)]:text-mute"
        }
      >
        {label}
      </label>
    </div>
  );
}

export function FloatSelect({
  label,
  id,
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; id: string }) {
  return (
    <div className={`relative ${className}`}>
      <select id={id} className={`${shell} appearance-none pr-8`} {...rest}>
        {children}
      </select>
      <label htmlFor={id} className="pointer-events-none absolute left-3 top-[13px] text-[10.5px] font-medium text-mute">
        {label}
      </label>
      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute">
        ▾
      </span>
    </div>
  );
}
