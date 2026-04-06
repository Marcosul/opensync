import type { ReactNode } from "react";

import { OpensyncLogo } from "@/components/brand/opensync-logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="py-2">
          <OpensyncLogo href="/" />
        </header>
        <section className="flex flex-1 items-center justify-center py-10">
          {children}
        </section>
      </div>
    </main>
  );
}
