"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { LAZY_GIT_BLOB_GC_MS, LAZY_GIT_BLOB_STALE_MS } from "@/lib/vault-git-blob-query";

export function QueryClientProviderWrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: LAZY_GIT_BLOB_STALE_MS,
            gcTime: LAZY_GIT_BLOB_GC_MS,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
