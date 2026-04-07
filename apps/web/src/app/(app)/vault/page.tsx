import { Suspense } from "react";

import { VaultView } from "@/components/app/vault-view";

export default function VaultPage() {
  return (
    <Suspense fallback={null}>
      <VaultView />
    </Suspense>
  );
}
