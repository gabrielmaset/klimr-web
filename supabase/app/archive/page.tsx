import { redirect } from "next/navigation";

/** The combined archive is retired — history lives in each section now. */
export default async function ArchiveRedirect({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  if (tab === "classes") redirect("/classes/past");
  if (tab === "tournaments") redirect("/tournaments/past");
  redirect("/events/past");
}
