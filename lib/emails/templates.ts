import { emailDocument, escapeHtml, h, p, button, detailBox, note } from "./layout";

type Email = { subject: string; html: string };

const FOOTER_DEFAULT = "You're receiving this because you have a Klimr account. Manage email preferences in Settings.";

/** New-member welcome. */
export function welcomeEmail({ name, appUrl }: { name: string; appUrl: string }): Email {
  const first = escapeHtml((name || "there").split(/\s+/)[0] || "there");
  const content =
    h(`Welcome to Klimr, ${first}.`) +
    p("You're in. Klimr is a verified sports network — every member is a real, identity-checked person, so your matches, rankings, and teams reflect real play.") +
    p("Here's a good first move: set your home ZIP and primary sport, then take a look at your local board. You climb your ZIP first, then your city, then the world.") +
    button(appUrl, "Open Klimr") +
    note("Find players and courts near you, join or start a team, and enter tournaments when you're ready.");
  return { subject: "Welcome to Klimr", html: emailDocument({ preheader: "You're in — here's how to get started.", content, footer: FOOTER_DEFAULT }) };
}

/** Tournament registration confirmed (team or individual). */
export function registrationConfirmedEmail({
  name,
  tournamentTitle,
  divisionName,
  isTeam,
  teamName,
  eventUrl,
}: {
  name: string;
  tournamentTitle: string;
  divisionName: string | null;
  isTeam: boolean;
  teamName?: string | null;
  eventUrl: string;
}): Email {
  const first = escapeHtml((name || "there").split(/\s+/)[0] || "there");
  const rows = [{ label: "Event", value: escapeHtml(tournamentTitle) }];
  if (divisionName) rows.push({ label: "Division", value: escapeHtml(divisionName) });
  if (isTeam && teamName) rows.push({ label: "Team", value: escapeHtml(teamName) });
  const content =
    h("You're registered.") +
    p(`Nice, ${first} — your entry for <strong>${escapeHtml(tournamentTitle)}</strong> is in.`) +
    detailBox(rows) +
    (isTeam
      ? p("Each of your players will get a separate note asking them to accept the rules and answer a couple of questions. Your entry is confirmed once that's done and any payment is reviewed.")
      : p("You'll be all set once any required payment is reviewed by the organizer.")) +
    button(eventUrl, "View the event") +
    note("Check the event page anytime for schedule, divisions, and updates.");
  return { subject: `You're registered — ${tournamentTitle}`, html: emailDocument({ preheader: `Your entry for ${tournamentTitle} is in.`, content, footer: FOOTER_DEFAULT }) };
}

/** Per-member: please confirm your spot (waiver/rules + questions). */
export function confirmationRequestEmail({
  name,
  tournamentTitle,
  teamName,
  confirmUrl,
}: {
  name: string;
  tournamentTitle: string;
  teamName: string;
  confirmUrl: string;
}): Email {
  const first = escapeHtml((name || "there").split(/\s+/)[0] || "there");
  const content =
    h("Confirm your spot.") +
    p(`${first}, <strong>${escapeHtml(teamName)}</strong> entered you in <strong>${escapeHtml(tournamentTitle)}</strong>. Take a moment to confirm — accept the rules and answer a couple of quick questions.`) +
    button(confirmUrl, "Confirm my spot") +
    note("Your team's entry isn't complete until each player confirms.");
  return { subject: `Confirm your spot — ${tournamentTitle}`, html: emailDocument({ preheader: `${teamName} entered you in ${tournamentTitle}.`, content, footer: FOOTER_DEFAULT }) };
}

/** Payment confirmed by the organizer. */
export function paymentConfirmedEmail({
  name,
  tournamentTitle,
  amount,
  eventUrl,
}: {
  name: string;
  tournamentTitle: string;
  amount: string | null;
  eventUrl: string;
}): Email {
  const first = escapeHtml((name || "there").split(/\s+/)[0] || "there");
  const rows = [{ label: "Event", value: escapeHtml(tournamentTitle) }];
  if (amount) rows.push({ label: "Amount", value: escapeHtml(amount) });
  const content =
    h("Payment confirmed.") +
    p(`All set, ${first} — the organizer confirmed your payment for <strong>${escapeHtml(tournamentTitle)}</strong>.`) +
    detailBox(rows) +
    button(eventUrl, "View the event") +
    note("See you on the court.");
  return { subject: `Payment confirmed — ${tournamentTitle}`, html: emailDocument({ preheader: `Your payment for ${tournamentTitle} is confirmed.`, content, footer: FOOTER_DEFAULT }) };
}

/** Payment declined — includes the organizer's reason and a re-upload link. */
export function paymentDeclinedEmail({
  name,
  tournamentTitle,
  reason,
  eventUrl,
}: {
  name: string;
  tournamentTitle: string;
  reason: string | null;
  eventUrl: string;
}): Email {
  const first = escapeHtml((name || "there").split(/\s+/)[0] || "there");
  const content =
    h("A quick fix on your payment.") +
    p(`${first}, the organizer couldn't confirm your payment for <strong>${escapeHtml(tournamentTitle)}</strong> just yet.`) +
    (reason ? detailBox([{ label: "Reason", value: escapeHtml(reason) }]) : "") +
    p("No problem — head to the event page to upload a new proof of payment and you'll be back on track.") +
    button(eventUrl, "Upload new proof") +
    note("Questions? Just reply to this email.");
  return { subject: `Action needed — payment for ${tournamentTitle}`, html: emailDocument({ preheader: `Re-upload your payment proof for ${tournamentTitle}.`, content, footer: FOOTER_DEFAULT }) };
}
