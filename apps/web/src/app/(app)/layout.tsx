import type { ReactNode } from "react";
import Link from "next/link";

import { OpensyncLogo } from "@/components/brand/opensync-logo";
import { Button } from "@/components/ui/button";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-secondary/20">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
          <OpensyncLogo href="/dashboard" />
          <nav className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/onboarding">Onboarding</Link>
            </Button>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                Sair
              </button>
            </form>
          </nav>
        </header>
        {children}
      </div>
    </main>
  );
}
