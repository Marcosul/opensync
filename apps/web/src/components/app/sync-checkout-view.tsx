"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { OpensyncLogo } from "@/components/brand/opensync-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SyncPlan = "standard" | "plus";
type StorageGb = 1 | 10 | 100;
type Renewal = "monthly" | "yearly";

function getPriceCents(plan: SyncPlan, storageGb: StorageGb, renewal: Renewal): number {
  if (plan === "standard") {
    return renewal === "monthly" ? 500 : 4800;
  }
  if (storageGb === 10) {
    return renewal === "monthly" ? 1000 : 9600;
  }
  return renewal === "monthly" ? 2000 : 19200;
}

function formatUsd(cents: number): string {
  return `USD $${(cents / 100).toFixed(2)}`;
}

function renewalLabel(renewal: Renewal): string {
  return renewal === "monthly" ? "Mensal" : "Anual";
}

function CheckoutRadioRow({
  selected,
  onSelect,
  title,
  subtitle,
  badge,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-primary" : "border-muted-foreground/35",
        )}
        aria-hidden
      >
        {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          {badge}
        </span>
        {subtitle ? <span className="mt-0.5 block text-sm text-muted-foreground">{subtitle}</span> : null}
      </span>
    </button>
  );
}

function RadioGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="space-y-2 rounded-2xl border border-border bg-card p-2">{children}</div>
    </div>
  );
}

export function SyncCheckoutView() {
  const searchParams = useSearchParams();
  const initialPlan: SyncPlan = searchParams.get("plan") === "plus" ? "plus" : "standard";

  const [plan, setPlan] = useState<SyncPlan>(initialPlan);
  const [storageGb, setStorageGb] = useState<StorageGb>(initialPlan === "plus" ? 10 : 1);
  const [renewal, setRenewal] = useState<Renewal>("monthly");

  useEffect(() => {
    setPlan(initialPlan);
    setStorageGb(initialPlan === "plus" ? 10 : 1);
  }, [initialPlan]);

  useEffect(() => {
    if (plan === "standard") {
      setStorageGb(1);
    } else {
      setStorageGb((prev) => (prev === 1 ? 10 : prev));
    }
  }, [plan]);

  const totalCents = useMemo(
    () => getPriceCents(plan, storageGb, renewal),
    [plan, storageGb, renewal],
  );

  const summaryLine = useMemo(() => {
    const tier = plan === "standard" ? "Standard" : "Plus";
    const freq = renewal === "monthly" ? "mensal" : "anual";
    return `Assinatura ${freq} OpenSync Sync (plano ${tier} ${storageGb} GB)`;
  }, [plan, renewal, storageGb]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:max-w-[58%] lg:flex-none lg:basis-[58%]">
          <div className="mx-auto max-w-xl space-y-8">
            <div>
              <OpensyncLogo href="/dashboard" className="inline-block" />
              <nav
                className="mt-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
                aria-label="Trilha"
              >
                <Link href="/settings?section=about" className="hover:text-foreground">
                  Conta
                </Link>
                <ChevronRight className="size-3.5 opacity-60" aria-hidden />
                <Link href="/settings?section=sync" className="hover:text-foreground">
                  Sincronização
                </Link>
                <ChevronRight className="size-3.5 opacity-60" aria-hidden />
                <span className="text-foreground">Checkout</span>
              </nav>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Escolha um plano Sync
              </h1>
            </div>

            <div className="space-y-6">
              <RadioGroup label="Plano">
                <CheckoutRadioRow
                  selected={plan === "standard"}
                  onSelect={() => setPlan("standard")}
                  title="Sync Standard"
                  subtitle="1 cofre sincronizado · 1 mês de histórico"
                />
                <CheckoutRadioRow
                  selected={plan === "plus"}
                  onSelect={() => setPlan("plus")}
                  title="Sync Plus"
                  subtitle="10 cofres sincronizados · 12 meses de histórico"
                />
              </RadioGroup>

              <RadioGroup label="Armazenamento">
                {plan === "standard" ? (
                  <CheckoutRadioRow
                    selected
                    onSelect={() => setStorageGb(1)}
                    title="1 GB"
                  />
                ) : (
                  <>
                    <CheckoutRadioRow
                      selected={storageGb === 10}
                      onSelect={() => setStorageGb(10)}
                      title="10 GB"
                    />
                    <CheckoutRadioRow
                      selected={storageGb === 100}
                      onSelect={() => setStorageGb(100)}
                      title="100 GB"
                    />
                  </>
                )}
              </RadioGroup>

              <RadioGroup label="Renovação">
                <CheckoutRadioRow
                  selected={renewal === "yearly"}
                  onSelect={() => setRenewal("yearly")}
                  title="Anual"
                  badge={
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      ECONOMIZE 20%
                    </span>
                  }
                />
                <CheckoutRadioRow
                  selected={renewal === "monthly"}
                  onSelect={() => setRenewal("monthly")}
                  title="Mensal"
                />
              </RadioGroup>
            </div>

            <Button type="button" size="lg" className="w-full sm:max-w-md">
              Ir para o pagamento
            </Button>
          </div>
        </div>

        <aside className="flex min-h-[280px] flex-col border-t border-border bg-muted/25 p-4 sm:p-6 lg:max-w-[42%] lg:flex-none lg:basis-[42%] lg:border-l lg:border-t-0">
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Frequência de cobrança</span>
              <span className="font-medium text-foreground">{renewalLabel(renewal)}</span>
            </div>

            <div className="mt-6 flex items-start justify-between gap-4 text-sm">
              <p className="min-w-0 flex-1 text-muted-foreground">{summaryLine}</p>
              <p className="shrink-0 font-medium tabular-nums text-foreground">{formatUsd(totalCents)}</p>
            </div>

            <div className="my-6 border-t border-border" />

            <div className="flex items-center justify-between text-base font-semibold sm:text-lg">
              <span>Total</span>
              <span className="tabular-nums">{formatUsd(totalCents)}</span>
            </div>

            <p className="mt-auto pt-8 text-center text-xs text-muted-foreground">
              Precisa de ajuda?{" "}
              <a href="mailto:support@opensync.space" className="text-primary underline-offset-4 hover:underline">
                Fale conosco
              </a>
              .{" "}
              <Link href="/" className="text-primary underline-offset-4 hover:underline">
                Política de reembolso
              </Link>
              .
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
