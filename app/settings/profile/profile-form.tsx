"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { saveProfileBasics, type EditState } from "../actions";

export type ProfileInitial = {
  first_name: string;
  last_name: string;
  bio: string;
  gender: string;
  dob: string;
  zip: string;
};

const GENDERS = [
  { value: "", label: "Prefer not to say" },
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "nonbinary", label: "Non-binary" },
];

const inputCls =
  "w-full rounded-xl border border-rule bg-surface shadow-e1 px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-ink";
const labelCls = "mb-1.5 block text-xs font-semibold text-mute";

export function ProfileBasicsForm({ initial }: { initial: ProfileInitial }) {
  const [state, action, pending] = useActionState<EditState, FormData>(saveProfileBasics, undefined);
  const [bio, setBio] = useState(initial.bio);

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="first_name">First name</label>
          <input id="first_name" name="first_name" defaultValue={initial.first_name} maxLength={40} required className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="last_name">Last name</label>
          <input id="last_name" name="last_name" defaultValue={initial.last_name} maxLength={40} required className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="bio">Bio</label>
        <textarea
          id="bio"
          name="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 160))}
          rows={3}
          placeholder="A line about your game — favorite shot, who you're looking to hit with…"
          className={`${inputCls} resize-none`}
        />
        <p className="mt-1 text-right text-[11px] text-faint">{bio.length}/160</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="gender">Gender</label>
          <select id="gender" name="gender" defaultValue={initial.gender} className={inputCls}>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="dob">Date of birth</label>
          <input id="dob" name="dob" type="date" defaultValue={initial.dob} required className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="zip">Home ZIP</label>
        <input id="zip" name="zip" inputMode="numeric" pattern="\d{5}" maxLength={5} defaultValue={initial.zip} required className={`${inputCls} sm:max-w-[180px]`} />
        <p className="mt-1.5 text-xs text-faint">Anchors your neighborhood, city, and state rankings.</p>
      </div>

      <div className="flex items-center gap-3 border-t border-rule pt-5">
        <button
          type="submit"
          disabled={pending}
          className="press rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <Link href="/settings" className="press text-sm font-semibold text-mute transition-colors hover:text-ink">Cancel</Link>
        {state?.ok ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-success"><Check size={15} /> Saved</span>
        ) : null}
        {state?.error ? <span className="text-sm text-brand-deep">{state.error}</span> : null}
      </div>
    </form>
  );
}
