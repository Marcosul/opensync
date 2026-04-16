import type { ReactNode } from "react";

import { BaseThemeProvider } from "@/components/theme/base-theme-provider";
import Link from "next/link";

export default function PublicVaultShareLayout({ children }: { children: ReactNode }) {
  return (
    <BaseThemeProvider>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 w-full max-w-[1360px] items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/" className="text-sm font-semibold text-foreground transition-colors hover:text-primary">
              OpenSync
            </Link>
            <span className="hidden text-xs text-muted-foreground sm:inline">Cofre partilhado (leitura)</span>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col px-4 py-6 sm:px-6">{children}</div>
      </div>
    </BaseThemeProvider>
  );
}
