import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { registrationConfirmedEmail, confirmationRequestEmail, paymentConfirmedEmail, paymentDeclinedEmail } from "./templates";

type Admin = ReturnType<typeof createAdminClient>;

async function getOrigin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://klimr.com";
}

async function emailOf(admin: Admin, userId: string): Promise<string | null> {
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

async function nameOf(admin: Admin, userId: string): Promise<string> {
  const { data } = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  return data?.display_name ?? "there";
}

/** Registration confirmed → registrant; plus a "confirm your spot" note to each
 *  teammate (team entries only). Best-effort; never throws. */
export async function notifyRegistration(registrationId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const origin = await getOrigin();
    const { data: reg } = await admin
      .from("tournament_registrations")
      .select("id, tournament_id, division_id, team_id, registrant_id")
      .eq("id", registrationId)
      .maybeSingle();
    if (!reg) return;
    const { data: t } = await admin.from("tournaments").select("title, code").eq("id", reg.tournament_id).maybeSingle();
    if (!t) return;
    const eventUrl = `${origin}/e/${t.code}`;

    let divisionName: string | null = null;
    if (reg.division_id) {
      const { data: d } = await admin.from("tournament_divisions").select("name").eq("id", reg.division_id).maybeSingle();
      divisionName = d?.name ?? null;
    }
    let teamName: string | null = null;
    if (reg.team_id) {
      const { data: tm } = await admin.from("teams").select("name").eq("id", reg.team_id).maybeSingle();
      teamName = tm?.name ?? null;
    }

    const regEmail = await emailOf(admin, reg.registrant_id);
    if (regEmail) {
      const { subject, html } = registrationConfirmedEmail({
        name: await nameOf(admin, reg.registrant_id),
        tournamentTitle: t.title,
        divisionName,
        isTeam: !!reg.team_id,
        teamName,
        eventUrl,
      });
      await sendEmail({ to: regEmail, subject, html });
    }

    if (reg.team_id) {
      const { data: players } = await admin.from("tournament_registration_players").select("user_id").eq("registration_id", reg.id);
      const others = (players ?? []).map((pl) => pl.user_id).filter((uid) => uid !== reg.registrant_id);
      const confirmUrl = `${origin}/e/${t.code}/confirm`;
      await Promise.allSettled(
        others.map(async (uid) => {
          const email = await emailOf(admin, uid);
          if (!email) return;
          const { subject, html } = confirmationRequestEmail({
            name: await nameOf(admin, uid),
            tournamentTitle: t.title,
            teamName: teamName ?? "Your team",
            confirmUrl,
          });
          await sendEmail({ to: email, subject, html });
        }),
      );
    }
  } catch (e) {
    console.error("[notify] registration", e);
  }
}

/** Payment confirmed/declined → registrant. Best-effort; never throws. */
export async function notifyPayment(registrationId: string, kind: "confirmed" | "denied", reason?: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const origin = await getOrigin();
    const { data: reg } = await admin.from("tournament_registrations").select("id, tournament_id, registrant_id").eq("id", registrationId).maybeSingle();
    if (!reg) return;
    const { data: t } = await admin.from("tournaments").select("title, code").eq("id", reg.tournament_id).maybeSingle();
    if (!t) return;
    const email = await emailOf(admin, reg.registrant_id);
    if (!email) return;
    const name = await nameOf(admin, reg.registrant_id);
    const eventUrl = `${origin}/e/${t.code}`;

    if (kind === "confirmed") {
      const { subject, html } = paymentConfirmedEmail({ name, tournamentTitle: t.title, amount: null, eventUrl });
      await sendEmail({ to: email, subject, html });
    } else {
      const { subject, html } = paymentDeclinedEmail({ name, tournamentTitle: t.title, reason: reason ?? null, eventUrl });
      await sendEmail({ to: email, subject, html });
    }
  } catch (e) {
    console.error("[notify] payment", e);
  }
}
