"use client";

import Image from "next/image";
import Link from "next/link";

import { useHomeI18n } from "@/components/marketing/home-i18n";
import { VaultMockup } from "@/components/marketing/vault-mockup";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HeroSection() {
  const { messages } = useHomeI18n();
  return (
    <section
      id="hero"
      className="relative flex flex-col items-center px-4 pb-16 pt-8 sm:px-6 lg:px-8 lg:pb-24 lg:pt-12"
    >
      <div className="mx-auto flex w-full max-w-[1360px] flex-col items-center text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden />
          {messages.hero.badge}
        </span>

        <h1 className="max-w-2xl text-balance font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
          {messages.hero.titleTop}
          <br />
          <span className="text-primary">{messages.hero.titleAccent}</span>
        </h1>

        <p className="mt-6 max-w-[40rem] text-pretty text-base text-muted-foreground sm:text-lg">
          {messages.hero.bodyPrefix}{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground">
            ./openclaw
          </code>{" "}
          {messages.hero.bodySuffix}
        </p>

        <div className="mt-10 flex w-full flex-col items-stretch justify-center gap-3 sm:max-w-[28rem] sm:flex-row sm:items-center sm:gap-4">
          <Link
            href="/sign-up"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-11 min-h-[44px] rounded-lg border-foreground/20 bg-background px-6 text-base font-medium shadow-none hover:bg-muted"
            )}
          >
            {messages.hero.startFree}
          </Link>
          <Link
            href="#features"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "h-11 min-h-[44px] rounded-lg border-foreground/20 bg-background px-6 text-base font-medium shadow-none hover:bg-muted"
            )}
          >
            {messages.hero.seeHow}
          </Link>
        </div>

        <div className="mt-14 w-full max-w-5xl">
          <VaultMockup />
        </div>

        <Link
          href="#features"
          className="mt-12 flex size-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          aria-label={messages.hero.scrollAria}
        >
          <span className="text-lg leading-none">↓</span>
        </Link>
      </div>
    </section>
  );
}

export function LandingBrandMark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-3", className)}>
      <Image
        src="/logo/opensync-icon-green.svg"
        alt=""
        width={40}
        height={40}
        className="size-10 rounded-lg"
      />
      <div className="text-left leading-none">
        <span className="block text-lg font-bold tracking-tight text-foreground">
          opensync
        </span>
        <span className="text-sm font-normal text-muted-foreground">.space</span>
      </div>
    </Link>
  );
}
