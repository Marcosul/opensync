import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app/app-sidebar";
import { QueryClientProviderWrapper } from "@/components/providers/query-client-provider";
import { BaseThemeProvider } from "@/components/theme/base-theme-provider";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <BaseThemeProvider>
      <QueryClientProviderWrapper>
        <div className="flex h-screen overflow-hidden bg-background">
          <AppSidebar />
          <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
        </div>
      </QueryClientProviderWrapper>
    </BaseThemeProvider>
  );
}
