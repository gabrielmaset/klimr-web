"use server";

import { randomInt } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Alphabet drops ambiguous characters (0/O, 1/I/L), matching the signup code style.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const DEFAULT_MAX_USES = 5;

function genCode(): string {
  const block = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `KLIMR-${block(4)}-${block(4)}`; // uppercase, length 15 (valid: 8–40)
}

export async function createMyInvite() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/invite");

  // One personal code per member.
  const { data: existing } = await supabase.from("invite_codes").select("code").eq("owner_id", user.id).limit(1).maybeSingle();
  if (existing) {
    revalidatePath("/invite");
    return;
  }

  const admin = createAdminClient();
  for (let i = 0; i < 6; i++) {
    const code = genCode();
    const { error } = await admin.from("invite_codes").insert({ code, max_uses: DEFAULT_MAX_USES, owner_id: user.id, note: "personal" });
    if (!error) break; // success; otherwise (e.g. rare code collision) retry
  }
  revalidatePath("/invite");
}
