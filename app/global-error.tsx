"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-diagnostics";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({
      message: `Global error: ${error.message}${error.digest ? ` (digest ${error.digest})` : ""}`,
      detail: error.stack,
      userMessage: "That didn\u2019t go as planned. The error has been reported automatically \u2014 try again.",
    });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#FAF7F1", color: "#201B12", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: "#C2410C" }}>Something slipped</p>
            <h1 style={{ margin: "8px 0 0", fontSize: 26, fontWeight: 700 }}>That didn&rsquo;t go as planned.</h1>
            <p style={{ margin: "8px 0 0", fontSize: 14, color: "#6E6555" }}>The error has been reported automatically.</p>
            <button
              onClick={reset}
              style={{ marginTop: 18, height: 36, padding: "0 16px", borderRadius: 10, border: 0, color: "#fff", fontWeight: 700, cursor: "pointer", background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
