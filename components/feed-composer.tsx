"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, Video, MessagesSquare, Trophy, Send, Loader2, X, Globe, Users, Lock, ChevronDown, Check } from "lucide-react";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { createTypedFeedPost, prepareFeedMediaUpload } from "@/app/feed/actions";

type PostType = "photo" | "video" | "ask" | "milestone";
const TYPES: { key: PostType; label: string; Icon: typeof ImageIcon }[] = [
  { key: "photo", label: "Photo", Icon: ImageIcon },
  { key: "video", label: "Highlight", Icon: Video },
  { key: "ask", label: "Ask the community", Icon: MessagesSquare },
  { key: "milestone", label: "Milestone", Icon: Trophy },
];

type Audience = "public" | "followers" | "friends";
const AUDIENCES: { key: Audience; label: string; sub: string; Icon: typeof Globe }[] = [
  { key: "public", label: "Public", sub: "Anyone on Klimr can see this", Icon: Globe },
  { key: "followers", label: "Friends & followers", sub: "People you're connected with or who follow you", Icon: Users },
  { key: "friends", label: "Friends only", sub: "Only your accepted connections", Icon: Lock },
];

/** Feed v2 composer — the four research-driven post types (photo, 30s highlight,
 *  ask, milestone). Match reports post automatically; no pills anywhere. */
export function FeedComposer({ initials, hue }: { initials: string; hue: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [body, setBody] = useState("");
  const [type, setType] = useState<PostType | null>(null);
  const [audience, setAudience] = useState<Audience>("public");
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ActiveAudienceIcon = AUDIENCES.find((a) => a.key === audience)?.Icon ?? Globe;

  useEffect(() => {
    if (!audienceOpen) return;
    const close = () => setAudienceOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [audienceOpen]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const clearMedia = () => {
    setFile(null);
    setDuration(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  const pickType = (t: PostType) => {
    setErr(null);
    if (type === t) {
      setType(null);
      clearMedia();
      return;
    }
    setType(t);
    clearMedia();
    if (t === "photo" || t === "video") {
      // Let state settle, then open the picker with the right accept.
      requestAnimationFrame(() => fileRef.current?.click());
    }
  };

  const onFile = (f: File | null) => {
    setErr(null);
    if (!f) return;
    if (type === "video") {
      const url = URL.createObjectURL(f);
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        const secs = Math.round(probe.duration);
        if (!Number.isFinite(secs) || secs < 1) {
          URL.revokeObjectURL(url);
          setErr("Couldn't read that clip — try a different file.");
          return;
        }
        if (secs > 30) {
          URL.revokeObjectURL(url);
          setErr(`Clips are capped at 30 seconds — that one runs ${secs}s. Trim it and try again.`);
          return;
        }
        setFile(f);
        setDuration(secs);
        setPreview(url);
      };
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        setErr("Couldn't read that clip — try a different file.");
      };
      probe.src = url;
    } else {
      if (f.size > 10 * 1024 * 1024) {
        setErr("Photos are capped at 10 MB.");
        return;
      }
      setFile(f);
      setPreview(URL.createObjectURL(f));
    }
  };

  const needsMedia = type === "photo" || type === "video";
  const ready = !pending && (needsMedia ? !!file : body.trim().length >= 2);

  const post = () => {
    if (!ready) return;
    setErr(null);
    startTransition(async () => {
      let mediaPath = "";
      if (needsMedia && file) {
        const ext = (file.name.split(".").pop() || (type === "video" ? "mp4" : "jpg")).toLowerCase();
        const slot = await prepareFeedMediaUpload({ kind: type as "photo" | "video", contentType: file.type, ext });
        if (!slot.ok || !slot.path || !slot.token) {
          setErr(slot.error ?? "Upload failed — try again.");
          return;
        }
        const supabase = createClient();
        const { error } = await supabase.storage.from("feed-media").uploadToSignedUrl(slot.path, slot.token, file);
        if (error) {
          setErr("Upload failed — try again.");
          return;
        }
        mediaPath = slot.path;
      }
      const fd = new FormData();
      fd.set("post_type", type ?? "post");
      fd.set("body", body.trim());
      if (mediaPath) fd.set("media_path", mediaPath);
      if (type === "video" && duration) fd.set("media_duration_seconds", String(duration));
      if (type === "milestone") fd.set("milestone_label", body.trim().slice(0, 120));
      fd.set("audience", audience);
      const res = await createTypedFeedPost(fd);
      if (!res.ok) {
        setErr(res.error ?? "Could not post — try again.");
        return;
      }
      setBody("");
      setType(null);
      clearMedia();
      setNote(
        res.status === "pending"
          ? "Posted — it's in review, so only you can see it until it clears."
          : res.status === "rejected"
            ? "That didn't pass the content check — it's saved on your feed as not published."
            : null
      );
      router.refresh();
    });
  };

  return (
    <div className="rounded-2xl border border-rule bg-surface px-[18px] pb-[13px] pt-4 shadow-e1">
      <div className="flex items-center gap-3">
        <span
          className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full text-sm font-bold text-white"
          style={{ background: `linear-gradient(145deg, hsl(${hue},70%,52%), hsl(${(hue + 24) % 360},66%,42%))` }}
        >
          {initials}
        </span>
        <input
          value={body}
          onChange={(e) => { setBody(e.target.value); setNote(null); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") post();
          }}
          placeholder="Share something with players nearby — a highlight, a question, a win…"
          className="h-10 min-w-0 flex-1 rounded-[11px] border border-rule-2 bg-ink/[0.03] px-3.5 text-[13.5px] text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/10"
        />
      </div>

      {preview ? (
        <div className="relative mt-3 overflow-hidden rounded-[13px] border border-rule-soft">
          {type === "video" ? (
            <video src={preview} className="block max-h-[300px] w-full object-cover" muted playsInline />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="Upload preview" className="block max-h-[330px] w-full object-cover" />
          )}
          {type === "video" && duration ? (
            <span className="absolute bottom-2.5 right-2.5 rounded-md bg-ink/60 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
              0:{String(duration).padStart(2, "0")}
            </span>
          ) : null}
          <button
            type="button"
            onClick={clearMedia}
            aria-label="Remove media"
            className="press absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-lg bg-ink/60 text-white hover:bg-ink/75"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept={type === "video" ? "video/mp4,video/webm,video/quicktime" : "image/jpeg,image/png,image/webp,image/gif"}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />

      <div className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-2.5 border-t border-rule-soft pt-3">
        <div className="flex flex-wrap items-center gap-[7px]">
          {TYPES.map(({ key, label, Icon }) => {
            const active = type === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => pickType(key)}
                title={label}
                className={`press inline-flex h-[30px] items-center gap-1.5 rounded-[10px] border px-3 text-xs font-semibold transition-colors ${
                  active ? "border-[#FFD4BC] bg-tint-brand text-brand-deep" : "border-rule-2 bg-surface text-mute hover:border-faint"
                }`}
              >
                <Icon size={13.5} /> {label}
              </button>
            );
          })}
        </div>

        <span className="ml-auto flex items-center gap-2">
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setAudienceOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={audienceOpen}
              className="press inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-rule-2 bg-surface px-2.5 text-xs font-semibold text-ink transition-colors hover:bg-hover"
            >
              <ActiveAudienceIcon size={13} className="text-mute" />
              <span className="hidden sm:inline">{AUDIENCES.find((a) => a.key === audience)?.label}</span>
              <ChevronDown size={13} className="text-faint" />
            </button>
            {audienceOpen ? (
              <div
                role="listbox"
                className="absolute right-0 top-9 z-30 w-56 rounded-xl border border-rule-2 bg-surface p-1 shadow-e3"
              >
                <p className="px-2.5 pb-1 pt-1.5 font-mono text-floor font-semibold uppercase tracking-[0.16em] text-faint">Who can see this</p>
                {AUDIENCES.map(({ key, label, sub, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    role="option"
                    aria-selected={audience === key}
                    onClick={() => {
                      setAudience(key);
                      setAudienceOpen(false);
                    }}
                    className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-hover ${
                      audience === key ? "bg-tint-brand/60" : ""
                    }`}
                  >
                    <Icon size={15} className={`mt-0.5 shrink-0 ${audience === key ? "text-brand-deep" : "text-mute"}`} />
                    <span className="min-w-0">
                      <span className={`block text-[13px] font-semibold ${audience === key ? "text-brand-deep" : "text-ink"}`}>{label}</span>
                      <span className="block text-[11px] leading-snug text-faint">{sub}</span>
                    </span>
                    {audience === key ? <Check size={14} className="ml-auto mt-0.5 shrink-0 text-brand-deep" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={post}
            disabled={!ready}
            className={`press inline-flex h-8 items-center gap-1.5 rounded-[10px] px-4 text-[13px] font-bold transition-colors ${
              ready ? "bg-brand text-white shadow-[0_4px_14px_-6px_rgba(214,58,15,.5)] hover:bg-[#E23E0D]" : "cursor-default bg-[#EDE7DA] text-faint"
            }`}
          >
            {pending ? <Loader2 size={13} className="animate-spin" /> : null}
            Post <Send size={13} />
          </button>
        </span>
      </div>
      {err ? <p className="mt-2 text-xs font-semibold text-danger">{err}</p> : null}
      {note ? <p className="mt-2 text-xs font-semibold text-brand-deep">{note}</p> : null}
      <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-faint">
        <Trophy size={12} /> Match reports post automatically when you finish a ranked match.
      </p>
    </div>
  );
}
