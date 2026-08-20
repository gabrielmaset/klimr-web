import { redirect } from "next/navigation";

// Team management now lives on the main Teams page (your teams + creation + discovery).
export default function SettingsTeamsRedirect() {
  redirect("/teams");
}
