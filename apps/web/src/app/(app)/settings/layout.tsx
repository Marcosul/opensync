import { Suspense, type ReactNode } from "react";

function SettingsFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
      Carregando configurações…
    </div>
  );
}

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SettingsFallback />}>{children}</Suspense>;
}
