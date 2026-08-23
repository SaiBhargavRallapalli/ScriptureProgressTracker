"use client";

import { useEffect } from "react";
import { registerOnlineSync } from "@/lib/sync";

/**
 * Wires up the "flush on regaining connectivity" half of Phase 6 sync
 * (ARCHITECTURE.md §3) app-wide — not just while the Settings page
 * happens to be open. Kept as its own client component, same reasoning
 * as ServiceWorkerRegister: lets the root layout stay a server
 * component.
 */
export default function SyncRegister() {
  useEffect(() => {
    registerOnlineSync();
  }, []);

  return null;
}
