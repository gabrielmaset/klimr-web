"use client";

import { useState } from "react";
import { HelpCenter } from "./help-center";
import { SupportChat } from "@/components/support-chat";

/** Owns the assistant's open state so the help center's "Ask the assistant"
 *  entry points can pop the same floating widget. */
export function HelpShell() {
  const [chatOpen, setChatOpen] = useState(false);
  return (
    <>
      <HelpCenter openChat={() => setChatOpen(true)} />
      <SupportChat open={chatOpen} onOpenChange={setChatOpen} />
    </>
  );
}
