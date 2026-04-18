import { useEffect, useState } from "react";

import { ipc, type AuthSession, type DesktopInfo } from "./lib/ipc";
import { LoginView } from "./views/login";
import { DashboardView } from "./views/dashboard";

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [current, desktopInfo] = await Promise.all([
          ipc.currentSession(),
          ipc.desktopInfo(),
        ]);
        if (cancelled) return;
        setSession(current);
        setInfo(desktopInfo);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (bootstrapping) {
    return (
      <main className="flex h-full items-center justify-center text-sm text-muted-foreground">
        A inicializar OpenSync Desktop…
      </main>
    );
  }

  if (!session) {
    return (
      <LoginView
        defaultApiUrl={info?.defaultApiUrl ?? "https://opensync.space/api"}
        onAuthenticated={setSession}
      />
    );
  }

  return (
    <DashboardView
      session={session}
      info={info}
      onLogout={async () => {
        await ipc.logout();
        setSession(null);
      }}
    />
  );
}
