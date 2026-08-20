import { redirect } from "next/navigation";

// Diagnostics moved to the Admin area (admin-only). This route is kept as a
// redirect so any old links land somewhere sensible instead of 404-ing.
export default function DiagnosticsMoved() {
  redirect("/settings");
}
