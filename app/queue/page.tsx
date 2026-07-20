import type { Metadata } from "next";
import { QueueHub } from "@/components/queue/queue-hub";

export const metadata: Metadata = { title: "Live Queue · Klimr" };

// The in-shell Live Queue home (left menu → here): join by code or start a
// standalone queue. The chromeless walk-up page at /q stays the QR / guest
// destination — same codes, same normalization, different frame.
export default function QueueHubPage() {
  return <QueueHub />;
}
