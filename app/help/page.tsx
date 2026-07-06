import type { Metadata } from "next";
import { HelpShell } from "./help-shell";

export const metadata: Metadata = {
  title: "Help center",
  description: "Answers, guides, and support for everything Klimr — plus an assistant that helps instantly.",
};

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <HelpShell />
    </div>
  );
}
