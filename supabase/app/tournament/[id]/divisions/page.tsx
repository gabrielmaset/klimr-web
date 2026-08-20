import { redirect } from "next/navigation";

// Divisions & fees now lives as a section inside Settings. Keep this route as a
// redirect so old links (and bookmarks) land on the right place.
export default async function DivisionsRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/tournament/${id}/settings#divisions`);
}
