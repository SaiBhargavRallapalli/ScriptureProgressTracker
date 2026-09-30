import SettingsClient from "@/components/SettingsClient";
import { getCurrentUser } from "@/lib/auth/dal";

export default async function SettingsPage() {
  // requireSession() already ran in app/(app)/layout.tsx, so a session is
  // guaranteed here — getCurrentUser() re-derives the DTO for display.
  const user = await getCurrentUser();
  return <SettingsClient user={{ email: user?.email ?? "" }} />;
}
