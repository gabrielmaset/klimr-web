"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accountActive } from "@/lib/guards";
import { createNotification } from "@/lib/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessSlug, BUSINESS_KINDS } from "@/lib/business";
import { SPORT_KEYS } from "@/lib/sports";

/** Create a draft business. RLS lets anyone draft as themselves; the 0135
 *  auto-owner trigger seats the creator. Activation (draft → active) is
 *  admin review via the service role — the console explains the wait. */
export async function createBusiness(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/business/new");
  if (!(await accountActive(supabase, user.id))) redirect("/business");

  const kind = String(formData.get("kind") ?? "");
  if (!BUSINESS_KINDS.some((k) => k.key === kind)) return;
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (name.length < 2) return;
  const headline = String(formData.get("headline") ?? "").trim().slice(0, 120) || null;
  const area = String(formData.get("area_text") ?? "").trim().slice(0, 80) || null;
  const sports = SPORT_KEYS.filter((s) => formData.get(`sport_${s}`) === "on");

  const { data: inserted } = await supabase
    .from("business_accounts")
    .insert({
      kind,
      name,
      slug: businessSlug(name, crypto.randomUUID()),
      owner_id: user.id,
      headline,
      area_text: area,
      sports,
    })
    .select("id")
    .maybeSingle();
  if (!inserted) return;
  redirect(`/business/${inserted.id}`);
}

/** Edit ordinary fields. verification_level/status are database-guarded —
 *  even a malicious payload can't move them from here. */
export async function updateBusiness(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const id = String(formData.get("businessId") ?? "");
  if (!id) return;
  type Patch = {
    name?: string; headline?: string | null; bio?: string | null; website?: string | null;
    contact_email?: string | null; phone?: string | null; area_text?: string | null; sports?: string[];
  };
  const patch: Patch = {};
  const take = (f: keyof Patch & string, max: number): string | null => {
    const v = String(formData.get(f) ?? "").trim();
    return v ? v.slice(0, max) : null;
  };
  if (formData.has("name")) {
    const n = take("name", 80);
    if (n && n.length >= 2) patch.name = n;
  }
  if (formData.has("headline")) patch.headline = take("headline", 120);
  if (formData.has("bio")) patch.bio = take("bio", 1200);
  if (formData.has("website")) patch.website = take("website", 160);
  if (formData.has("contact_email")) patch.contact_email = take("contact_email", 160);
  if (formData.has("phone")) patch.phone = take("phone", 40);
  if (formData.has("area_text")) patch.area_text = take("area_text", 80);
  if (formData.has("sports_present")) patch.sports = SPORT_KEYS.filter((s) => formData.get(`sport_${s}`) === "on");
  if (!Object.keys(patch).length) return;
  await supabase.from("business_accounts").update(patch).eq("id", id);
  revalidatePath(`/business/${id}`);
}

/** Publish toggle — takes real effect only once the business is active
 *  AND the platform `business_publication` flag is on. */
export async function setBusinessPublished(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const id = String(formData.get("businessId") ?? "");
  const on = String(formData.get("published") ?? "") === "true";
  if (!id) return;
  await supabase.from("business_accounts").update({ published: on }).eq("id", id);
  revalidatePath(`/business/${id}`);
}

/* ============ Sponsorship proposals (engine: 0136) ============ */

export type SponsorTargetHit = { id: string; name: string; sub: string | null };

/** Search events or teams to sponsor. Player targeting exists in the engine
 *  but the surface ships "Coming soon" — this search never returns players. */
export async function searchSponsorTargets(kind: string, q: string): Promise<{ hits: SponsorTargetHit[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { hits: [] };
  const needle = q.trim().slice(0, 60);
  if (needle.length < 2) return { hits: [] };
  if (kind === "event") {
    const { data } = await supabase
      .from("events")
      .select("id, title, sport_key, recurrence")
      .eq("status", "published")
      .is("cancelled_at", null)
      .ilike("title", `%${needle}%`)
      .limit(8);
    return {
      hits: ((data ?? []) as { id: string; title: string; sport_key: string; recurrence: string }[]).map((e) => ({
        id: e.id,
        name: e.title,
        sub: `${e.sport_key}${e.recurrence !== "none" ? " · recurring" : ""}`,
      })),
    };
  }
  if (kind === "team") {
    const { data } = await supabase
      .from("teams")
      .select("id, name, sport_key, city")
      .is("deleted_at", null)
      .ilike("name", `%${needle}%`)
      .limit(8);
    return {
      hits: ((data ?? []) as { id: string; name: string; sport_key: string; city: string | null }[]).map((t) => ({
        id: t.id,
        name: t.name,
        sub: `${t.sport_key}${t.city ? ` · ${t.city}` : ""}`,
      })),
    };
  }
  return { hits: [] };
}

/** Propose a sponsorship. The 0136 trigger enforces sponsor-readiness,
 *  category policy, and target existence; RLS enforces that a manager of the
 *  business signs as themselves. Target controllers get notified to respond. */
export async function proposeSponsorship(input: {
  businessId: string;
  targetKind: "event" | "team";
  targetId: string;
  label: string;
  amountDollars: string;
  description: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  const label = input.label.trim().slice(0, 60) || "Sponsor";
  const description = input.description.trim().slice(0, 400) || null;
  let amount_cents: number | null = null;
  if (input.amountDollars.trim()) {
    const n = Number(input.amountDollars.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) return { error: "That amount doesn't look right." };
    amount_cents = Math.round(n * 100);
  }
  const { error } = await supabase.from("sponsorships").insert({
    business_id: input.businessId,
    target_kind: input.targetKind,
    target_id: input.targetId,
    label,
    description,
    amount_cents,
    created_by: user.id,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("not_sponsor_ready")) return { error: "This business isn't Sponsor-ready yet (Tier 2)." };
    if (msg.includes("prohibited_category")) return { error: "This business category can't sponsor on Klimr." };
    if (msg.includes("duplicate") || error.code === "23505") return { error: "You already have a sponsorship with this target." };
    if (msg.includes("target_missing")) return { error: "That target no longer exists." };
    return { error: "Couldn't send the proposal." };
  }

  // Notify the target's controllers.
  const { data: biz } = await supabase.from("business_accounts").select("name").eq("id", input.businessId).maybeSingle();
  const controllers = new Set<string>();
  let targetLabel = "";
  if (input.targetKind === "event") {
    const [{ data: ev }, { data: mgrs }] = await Promise.all([
      supabase.from("events").select("title, created_by").eq("id", input.targetId).maybeSingle(),
      supabase.from("event_managers").select("user_id").eq("event_id", input.targetId),
    ]);
    targetLabel = ev?.title ?? "your event";
    if (ev?.created_by) controllers.add(ev.created_by);
    for (const m of (mgrs ?? []) as { user_id: string }[]) controllers.add(m.user_id);
  } else {
    const [{ data: tm }, { data: mgrs }] = await Promise.all([
      supabase.from("teams").select("name, created_by").eq("id", input.targetId).maybeSingle(),
      supabase.from("team_members").select("user_id").eq("team_id", input.targetId).eq("role", "manager"),
    ]);
    targetLabel = tm?.name ?? "your team";
    if (tm?.created_by) controllers.add(tm.created_by);
    for (const m of (mgrs ?? []) as { user_id: string }[]) controllers.add(m.user_id);
  }
  controllers.delete(user.id);
  await Promise.all(
    [...controllers].map((uid) =>
      createNotification({
        userId: uid,
        kind: "sponsorship",
        title: `${biz?.name ?? "A business"} wants to sponsor ${targetLabel}`,
        body: "Nothing shows anywhere until you approve.",
        linkUrl: input.targetKind === "event" ? `/events/${input.targetId}` : `/team/${input.targetId}`,
      }),
    ),
  );
  revalidatePath(`/business/${input.businessId}`);
  return { ok: true };
}

/** Withdraw a pending proposal (RLS: managers, pending only). */
export async function withdrawSponsorship(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const id = String(formData.get("sponsorshipId") ?? "");
  const businessId = String(formData.get("businessId") ?? "");
  if (!id) return;
  await supabase.from("sponsorships").delete().eq("id", id);
  if (businessId) revalidatePath(`/business/${businessId}`);
}

/** Target controller responds (wraps the audited 0136 RPC). Form action. */
export async function respondSponsorshipAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const id = String(formData.get("sponsorshipId") ?? "");
  const accept = String(formData.get("decision") ?? "") === "approve";
  const back = String(formData.get("back") ?? "");
  if (!id) return;
  await supabase.rpc("respond_sponsorship", { p_id: id, p_accept: accept });
  if (back) revalidatePath(back);
}

/* ============ Tier-2 application (0137) ============ */

const DOC_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif", "application/pdf"]);

async function businessManagerGuard(businessId: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const { data: m } = await supabase
    .from("business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!m || (m.role !== "owner" && m.role !== "manager")) return { ok: false, error: "Managers only." };
  return { ok: true, userId: user.id };
}

/** Mint a single-use signed upload URL for a Tier-2 review document.
 *  Path is built server-side under the business folder; the private bucket's
 *  RLS re-checks the same manager authorization at upload time. */
export async function createBusinessDocUploadUrl(businessId: string, filename: string, contentType: string) {
  if (!DOC_TYPES.has(contentType)) return { ok: false as const, error: "PDFs or images only." };
  const guard = await businessManagerGuard(businessId);
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60) || "document";
  const path = `${businessId}/${crypto.randomUUID()}-${safe}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("business-docs").createSignedUploadUrl(path);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, path, token: data.token };
}

export type TierDoc = { path: string; name: string; size: number };

/** Submit the Tier-2 application: documents + domain + terms. The 0137 trigger
 *  enforces eligibility (active, not already tier2, 1–8 docs, real domain)
 *  and the partial unique index enforces one open application. */
export async function submitTierApplication(input: {
  businessId: string;
  domain: string;
  notes: string;
  docs: TierDoc[];
  termsAccepted: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  const guard = await businessManagerGuard(input.businessId);
  if (!guard.ok) return { error: guard.error };
  if (!input.termsAccepted) return { error: "Accept the sponsor terms to apply." };
  const docs = input.docs.slice(0, 8).map((d) => ({ path: d.path, name: d.name.slice(0, 80), size: d.size }));
  if (!docs.length) return { error: "Attach at least one document." };
  // Every path must live under THIS business's folder — a foreign path would
  // otherwise get a signed READ url minted for it in the admin queue.
  if (!docs.every((d) => d.path.startsWith(`${input.businessId}/`) && !d.path.includes(".."))) {
    return { error: "One of the attachments doesn't belong to this business." };
  }
  const domain = input.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").slice(0, 120);
  const supabase = await createClient();
  const { error } = await supabase.from("business_tier_applications").insert({
    business_id: input.businessId,
    submitted_by: guard.userId,
    domain,
    notes: input.notes.trim().slice(0, 500) || null,
    docs,
    terms_accepted_at: new Date().toISOString(),
  });
  if (error) {
    const msg = error.message ?? "";
    if (error.code === "23505") return { error: "You already have an application under review." };
    if (msg.includes("not_active")) return { error: "The business must pass its first review before applying." };
    if (msg.includes("already_tier2")) return { error: "This business is already Sponsor-ready." };
    if (msg.includes("bad_domain")) return { error: "Enter the business website domain (e.g. proshop.com)." };
    if (msg.includes("bad_docs_count")) return { error: "Attach between one and eight documents." };
    return { error: "Couldn't submit the application." };
  }
  revalidatePath(`/business/${input.businessId}`);
  return { ok: true };
}

/** Withdraw an open application (RLS: managers, submitted only). */
export async function withdrawTierApplication(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const id = String(formData.get("applicationId") ?? "");
  const businessId = String(formData.get("businessId") ?? "");
  if (!id) return;
  await supabase.from("business_tier_applications").delete().eq("id", id);
  if (businessId) revalidatePath(`/business/${businessId}`);
}
