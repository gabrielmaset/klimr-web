import { redirect } from "next/navigation";

// Legal (waiver & rules) is configured in the Legal section of the Settings
// page — this former standalone route just forwards there, including for any
// old links or bookmarks.
export default async function LegalRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/tournament/${id}/settings#legal`);
}
