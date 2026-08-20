"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

/** Mounted once (root layout) so global error/warning capture is always on. */
export function DiagnosticsInit() {
  useEffect(() => {
    logger.install();
  }, []);
  return null;
}
