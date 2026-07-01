"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Link2, Highlighter, Baseline, Eraser, ChevronDown, Palette } from "lucide-react";

// Word-style palettes: a grid of presets plus a native custom picker per menu.
const TEXT_PALETTE = [
  "#0a0a0b", "#3f3f46", "#71717a", "#a1a1aa", "#d4d4d8", "#ffffff",
  "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#16a34a", "#059669",
  "#0891b2", "#0284c7", "#2563eb", "#4f46e5", "#7c3aed", "#c026d3",
  "#db2777", "#e11d48", "#f43f5e", "#fb923c", "#facc15", "#4ade80",
  "#7f1d1d", "#78350f", "#365314", "#064e3b", "#1e3a8a", "#4a044e",
];
const HILITE_PALETTE = [
  "#fde047", "#fef08a", "#a7f3d0", "#bbf7d0", "#bfdbfe", "#93c5fd",
  "#fbcfe8", "#f5d0fe", "#ddd6fe", "#fed7aa", "#fecaca", "#99f6e4",
  "#fef9c3", "#dcfce7", "#dbeafe", "#fae8ff", "#ffedd5", "#fee2e2",
];

/** Wrap bare http(s) URLs in real <a> tags, skipping text already inside links. Browser-only. */
export function linkifyHtml(html: string): string {
  if (!html) return "";
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const urlRe = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]}'"])/g;
  const targets: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const t = n as Text;
    if (t.parentElement?.closest("a")) continue;
    if (t.nodeValue && urlRe.test(t.nodeValue)) targets.push(t);
    urlRe.lastIndex = 0;
  }
  for (const t of targets) {
    const frag = doc.createDocumentFragment();
    let last = 0;
    const text = t.nodeValue ?? "";
    text.replace(urlRe, (match, _g, offset: number) => {
      if (offset > last) frag.appendChild(doc.createTextNode(text.slice(last, offset)));
      const a = doc.createElement("a");
      a.href = match;
      a.textContent = match;
      frag.appendChild(a);
      last = offset + match.length;
      return match;
    });
    if (last < text.length) frag.appendChild(doc.createTextNode(text.slice(last)));
    t.parentNode?.replaceChild(frag, t);
  }
  return root.innerHTML;
}

const btn = "grid h-8 w-8 place-items-center rounded-lg text-mute transition-colors hover:bg-bg hover:text-ink";

function ColorMenu({ kind, palette, apply, saveSel }: { kind: "text" | "hilite"; palette: string[]; apply: (c: string) => void; saveSel: () => void }) {
  const [open, setOpen] = useState(false);
  const Icon = kind === "text" ? Baseline : Highlighter;
  const pick = (c: string) => {
    apply(c);
    setOpen(false);
  };
  return (
    <span className="relative">
      <button
        type="button"
        title={kind === "text" ? "Text colour" : "Highlight"}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          saveSel();
          setOpen((o) => !o);
        }}
        className="press inline-flex h-8 items-center gap-0.5 rounded-lg px-1.5 text-mute transition-colors hover:bg-bg hover:text-ink"
      >
        <Icon size={15} />
        <ChevronDown size={11} className="text-faint" />
      </button>
      {open ? (
        <>
          <button type="button" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div className="absolute left-0 top-9 z-20 w-[196px] rounded-xl border border-rule bg-surface p-2 shadow-lg">
            <div className="grid grid-cols-6 gap-1">
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  title={c}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    saveSel();
                  }}
                  onClick={() => pick(c)}
                  className="press h-6 w-6 rounded-md border border-rule"
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-rule pt-2">
              <label className="press inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink" title="Custom colour">
                <span className="grid h-6 w-6 place-items-center rounded-md border border-rule text-mute">
                  <Palette size={13} />
                </span>
                Custom
                <input
                  type="color"
                  onMouseDown={saveSel}
                  onChange={(e) => pick(e.target.value)}
                  className="sr-only"
                />
              </label>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(kind === "text" ? "#0a0a0b" : "transparent")} className="press text-xs font-semibold text-mute hover:text-ink">
                {kind === "text" ? "Default" : "None"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </span>
  );
}

export function RichTextEditor({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const savedRange = useRef<Range | null>(null);

  // Seed the editable region once; afterwards the DOM is the source of truth so the
  // caret never jumps. (One-time mount write — intentional.)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || "")) ref.current.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => onChange(ref.current?.innerHTML ?? "");

  // Snapshot the current selection so a menu / native colour picker (which steals focus)
  // can restore it before applying.
  const saveSel = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && ref.current && ref.current.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };
  const restoreSel = () => {
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  const exec = (command: string, val?: string) => {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, val);
    emit();
  };

  const applyTextColor = (color: string) => {
    ref.current?.focus();
    restoreSel();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("foreColor", false, color);
    emit();
  };
  const applyHiliteColor = (color: string) => {
    ref.current?.focus();
    restoreSel();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand("hiliteColor", false, color);
    emit();
  };

  const addLink = () => {
    const url = window.prompt("Link URL (https://…)");
    if (!url) return;
    const safe = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    exec("createLink", safe);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-bg focus-within:border-brand">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-rule bg-surface px-1.5 py-1">
        <button type="button" title="Bold" onClick={() => exec("bold")} className={btn}><Bold size={15} /></button>
        <button type="button" title="Italic" onClick={() => exec("italic")} className={btn}><Italic size={15} /></button>
        <button type="button" title="Underline" onClick={() => exec("underline")} className={btn}><Underline size={15} /></button>
        <button type="button" title="Strikethrough" onClick={() => exec("strikeThrough")} className={btn}><Strikethrough size={15} /></button>
        <span className="mx-1 h-5 w-px bg-rule" />
        <button type="button" title="Bulleted list" onClick={() => exec("insertUnorderedList")} className={btn}><List size={15} /></button>
        <button type="button" title="Numbered list" onClick={() => exec("insertOrderedList")} className={btn}><ListOrdered size={15} /></button>
        <button type="button" title="Add link" onClick={addLink} className={btn}><Link2 size={15} /></button>
        <span className="mx-1 h-5 w-px bg-rule" />
        <ColorMenu kind="text" palette={TEXT_PALETTE} apply={applyTextColor} saveSel={saveSel} />
        <ColorMenu kind="hilite" palette={HILITE_PALETTE} apply={applyHiliteColor} saveSel={saveSel} />
        <span className="mx-1 h-5 w-px bg-rule" />
        <button type="button" title="Clear formatting" onClick={() => exec("removeFormat")} className={btn}><Eraser size={15} /></button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder ?? "What to expect, level, what to bring…"}
        className="rte-editable min-h-[140px] px-3.5 py-3 text-sm leading-relaxed text-ink outline-none"
      />
    </div>
  );
}
