"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, Underline, Strikethrough, List, ListOrdered, Link2, Highlighter, Baseline, Eraser } from "lucide-react";

const TEXT_COLORS = ["#0a0a0b", "#d63a0f", "#1d4ed8", "#15803d", "#7c3aed", "#b45309"];
const HILITES = ["#fff1ed", "#fef9c3", "#dcfce7", "#dbeafe", "#fae8ff"];

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

export function RichTextEditor({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Seed the editable region once; afterwards the DOM is the source of truth so the
  // caret never jumps. (One-time mount write — intentional.)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (value || "")) ref.current.innerHTML = value || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => onChange(ref.current?.innerHTML ?? "");

  const exec = (command: string, val?: string) => {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, val);
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
        <span className="inline-flex items-center gap-0.5" title="Text colour">
          <Baseline size={14} className="text-faint" />
          {TEXT_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Text colour ${c}`} onClick={() => exec("foreColor", c)} className="press h-4 w-4 rounded-full border border-rule" style={{ background: c }} />
          ))}
        </span>
        <span className="mx-1 h-5 w-px bg-rule" />
        <span className="inline-flex items-center gap-0.5" title="Highlight">
          <Highlighter size={14} className="text-faint" />
          {HILITES.map((c) => (
            <button key={c} type="button" aria-label={`Highlight ${c}`} onClick={() => exec("hiliteColor", c)} className="press h-4 w-4 rounded-full border border-rule" style={{ background: c }} />
          ))}
        </span>
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
