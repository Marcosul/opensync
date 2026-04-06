"use client";

import Link from "next/link";
import { useState } from "react";

import { useHomeI18n } from "@/components/marketing/home-i18n";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Billing = "annual" | "monthly";

function CheckIcon() {
  return (
    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-primary" aria-hidden>
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function DotIcon() {
  return (
    <span
      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/35"
      aria-hidden
    />
  );
}

function XIcon() {
  return (
    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground/60" aria-hidden>
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function PricingSection() {
  const { messages } = useHomeI18n();
  const [billing, setBilling] = useState<Billing>("annual");

  const proMonthly = billing === "annual" ? 5 : 6.25;
  const proSub =
    billing === "annual" ? messages.pricing.billedAnnualPro : messages.pricing.billedMonthly;
  const teamMonthly = billing === "annual" ? 12 : 15;
  const teamSub =
    billing === "annual" ? messages.pricing.billedAnnualTeam : messages.pricing.billedMonthly;

  const opensyncColLabel =
    billing === "annual"
      ? "opensync Pro — $5/mo"
      : "opensync Pro — $6.25/mo";

  return (
    <section
      id="pricing"
      className="border-t border-border/60 bg-background px-4 py-20 sm:px-6 lg:px-8"
    >
      <div className="mx-auto w-full max-w-[1360px]">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {messages.pricing.eyebrow}
          </p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {messages.pricing.title}
          </h2>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex rounded-full border border-border bg-muted/40 p-1">
              <button
                type="button"
                onClick={() => setBilling("annual")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  billing === "annual"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {messages.pricing.annual}
              </button>
              <button
                type="button"
                onClick={() => setBilling("monthly")}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  billing === "monthly"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {messages.pricing.monthly}
              </button>
            </div>
            <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              {messages.pricing.save}
            </span>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-5">
          <article className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <h3 className="text-xl font-bold">Free</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {messages.pricing.freeDescription}
            </p>
            <p className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight">$0</span>
              <span className="text-muted-foreground">/mo</span>
            </p>
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "mt-8 w-full rounded-lg"
              )}
            >
              {messages.pricing.startFree}
            </Link>
            <ul className="mt-8 space-y-3 text-sm">
              {messages.pricing.freeFeatures.map((feature, index) => (
                <li
                  key={feature}
                  className={cn(
                    "flex gap-2",
                    index >= 3 && "text-muted-foreground"
                  )}
                >
                  {index >= 3 ? <DotIcon /> : <CheckIcon />}
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="relative flex flex-col rounded-xl border-2 border-primary bg-card p-6 shadow-md sm:p-8">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
              {messages.pricing.mostPopular}
            </span>
            <h3 className="text-xl font-bold">Pro</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {messages.pricing.proDescription}
            </p>
            <p className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight">
                ${proMonthly % 1 === 0 ? proMonthly : proMonthly.toFixed(2)}
              </span>
              <span className="text-muted-foreground">/mo</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{proSub}</p>
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "mt-8 w-full rounded-lg border-primary/40"
              )}
            >
              {messages.pricing.startTrial}
            </Link>
            <ul className="mt-8 space-y-3 text-sm">
              {messages.pricing.proFeatures.map((line) => (
                <li key={line} className="flex gap-2">
                  <CheckIcon />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <h3 className="text-xl font-bold">Team</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {messages.pricing.teamDescription}
            </p>
            <p className="mt-6 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight">
                ${teamMonthly % 1 === 0 ? teamMonthly : teamMonthly.toFixed(2)}
              </span>
              <span className="text-muted-foreground">/user/mo</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{teamSub}</p>
            <Link
              href="/sign-up"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "mt-8 w-full rounded-lg"
              )}
            >
              {messages.pricing.contactUs}
            </Link>
            <ul className="mt-8 space-y-3 text-sm">
              {messages.pricing.teamFeatures.map((line) => (
                <li key={line} className="flex gap-2">
                  <CheckIcon />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>

        <div className="mt-16 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="border-b border-border px-4 py-4 font-semibold sm:px-6">
                  {messages.pricing.compareHeaderFeature}
                </th>
                <th className="border-b border-border px-4 py-4 font-semibold text-primary sm:px-6">
                  {opensyncColLabel}
                </th>
                <th className="border-b border-border px-4 py-4 font-semibold sm:px-6">
                  {messages.pricing.compareHeaderObsidian}
                </th>
              </tr>
            </thead>
            <tbody>
              {messages.pricing.compareRows.map((row, index) => (
                <ComparisonRow
                  key={row.feature}
                  feature={row.feature}
                  opensync={row.opensync}
                  opensyncGood
                  other={row.other}
                  otherTone={index === 2 ? "neutral" : index > 3 ? "bad" : "good"}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold">
                <td className="border-t border-border px-4 py-4 sm:px-6">
                  {messages.pricing.totalMonthly}
                </td>
                <td className="border-t border-border px-4 py-4 text-primary sm:px-6">
                  {billing === "annual" ? "$5/mo" : "$6.25/mo"}
                </td>
                <td className="border-t border-border px-4 py-6 sm:px-6">
                  $12/mo+
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}

function ComparisonRow({
  feature,
  opensync,
  other,
  opensyncGood,
  otherTone = "good",
}: {
  feature: string;
  opensync: string;
  other: string;
  opensyncGood?: boolean;
  otherTone?: "good" | "bad" | "neutral";
}) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-4 align-top text-muted-foreground sm:px-6">{feature}</td>
      <td className="px-4 py-4 align-top sm:px-6">
        <span className="inline-flex items-start gap-2">
          {opensyncGood ? <CheckIcon /> : null}
          <span className={opensyncGood ? "text-foreground" : ""}>{opensync}</span>
        </span>
      </td>
      <td className="px-4 py-4 align-top sm:px-6">
        <span className="inline-flex items-start gap-2">
          {otherTone === "good" ? <CheckIcon /> : null}
          {otherTone === "bad" ? <XIcon /> : null}
          <span
            className={cn(
              otherTone === "bad" && "text-muted-foreground",
              otherTone === "good" && "text-foreground",
              otherTone === "neutral" && "text-muted-foreground"
            )}
          >
            {other}
          </span>
        </span>
      </td>
    </tr>
  );
}
