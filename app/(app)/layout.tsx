import DbProvider from "@/components/DbProvider";
import Nav from "@/components/Nav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import SyncRegister from "@/components/SyncRegister";
import { getCurrentUser, requireSession } from "@/lib/auth/dal";

// This is the pre-Phase-7 root layout body, moved here and made
// auth-aware: requireSession() redirects to /login for anyone without a
// valid session, so every page under this route group is protected
// without needing its own check (per the Next.js auth guide's "layouts
// don't re-render on every navigation" caveat, this DOES re-run on every
// navigation into the group — Partial Rendering only skips re-render for
// layouts that stay mounted across a navigation *within* the group, not
// the initial entry).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const user = (await getCurrentUser()) ?? { id: session.userId, email: session.email };

  return (
    <>
      <ServiceWorkerRegister />
      <Nav user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <DbProvider userId={session.userId}>
          <SyncRegister />
          {children}
        </DbProvider>
      </main>
    </>
  );
}
