"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function InviteWorkspaceContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ok" | "err">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("err");
      setMessage("Link inválido (sem token).");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workspace-invites/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (res.status === 401) {
          const next = `/invite/workspace?token=${encodeURIComponent(token)}`;
          router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
          return;
        }
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || "Falha ao aceitar");
        }
        const data = (await res.json()) as { workspaceId?: string };
        if (!cancelled) {
          setStatus("ok");
          setMessage("Convite aceite. A redirecionar…");
          router.replace(data.workspaceId ? `/dashboard` : "/dashboard");
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("err");
          setMessage(e instanceof Error ? e.message : "Erro");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      {status === "loading" ? (
        <>
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">A aceitar convite…</p>
        </>
      ) : null}
      {status === "ok" ? <p className="text-sm text-foreground">{message}</p> : null}
      {status === "err" ? (
        <>
          <p className="text-sm text-destructive">{message}</p>
          <Link href="/dashboard" className="text-sm text-primary underline">
            Ir para o dashboard
          </Link>
        </>
      ) : null}
    </div>
  );
}

export default function InviteWorkspacePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-12">
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <InviteWorkspaceContent />
      </Suspense>
    </div>
  );
}
