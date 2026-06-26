import { redirect } from "next/navigation";

// The setup wizard now runs only once, at creation (/tournaments/new). All
// editing afterward lives on the Settings page — so this former edit route just
// forwards there, including for any old links or bookmarks.
export default async function SetupRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/tournament/${id}/settings`);
}
