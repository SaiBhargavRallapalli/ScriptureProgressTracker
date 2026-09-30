import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/dal";
import { claimLegacyRows, ensureSchema } from "@/lib/syncDb";

// POST /api/admin/claim-legacy-data — one-time migration for a
// pre-Phase-7 deployment's existing "ownerless" Postgres rows (userId is
// null, from before accounts existed). Gated to whichever account's email
// matches LEGACY_ADMIN_EMAIL, so this can't be triggered by any signed-up
// account. Safe to call more than once — after the first successful run
// every row already has a userId, so later calls report zero claimed.
export async function POST() {
  const session = await requireApiSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const adminEmail = process.env.LEGACY_ADMIN_EMAIL;
  if (!adminEmail || session.email.toLowerCase() !== adminEmail.toLowerCase()) {
    return NextResponse.json({ error: "Not authorized to run this." }, { status: 403 });
  }

  await ensureSchema();
  const claimed = await claimLegacyRows(session.userId);
  return NextResponse.json({ claimed });
}
