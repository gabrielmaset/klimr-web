import type { Metadata } from "next";
import { QLanding } from "@/components/queue/q-landing";

export const metadata: Metadata = { title: "Join a live queue · Klimr" };

export default function QIndexPage() {
  return <QLanding />;
}
