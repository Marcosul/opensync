import { Suspense } from "react";

import { SyncCheckoutView } from "@/components/app/sync-checkout-view";

function CheckoutFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
      Carregando checkout…
    </div>
  );
}

export default function SyncCheckoutPage() {
  return (
    <Suspense fallback={<CheckoutFallback />}>
      <SyncCheckoutView />
    </Suspense>
  );
}
