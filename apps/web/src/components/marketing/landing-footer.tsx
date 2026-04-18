"use client";

import Link from "next/link";

import { useHomeI18n } from "@/components/marketing/home-i18n";
import { LandingBrandMark } from "@/components/marketing/hero-section";
import { cn } from "@/lib/utils";

const footerLinkClass =
  "text-sm text-muted-foreground transition-colors hover:text-foreground";

export function LandingFooter({ className }: { className?: string }) {
  const { messages } = useHomeI18n();

  return (
    <footer
      className={cn(
        "border-t border-border/60 bg-[#EEECE8]/80 px-4 py-12 sm:px-6 sm:py-14 lg:px-8",
        className
      )}
    >
      <div className="mx-auto w-full max-w-[1360px]">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          <div className="max-w-sm space-y-4">
            <LandingBrandMark />
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              {messages.footer.tagline}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:max-w-md sm:gap-12 lg:max-w-none lg:grid-cols-2 lg:gap-20">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {messages.footer.product}
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                <li>
                  <Link href="#problem" className={footerLinkClass}>
                    {messages.problem.eyebrow}
                  </Link>
                </li>
                <li>
                  <Link href="#solution" className={footerLinkClass}>
                    {messages.solution.eyebrow}
                  </Link>
                </li>
                <li>
                  <Link href="#how-it-works" className={footerLinkClass}>
                    {messages.howItWorks.eyebrow}
                  </Link>
                </li>
                <li>
                  <Link href="#manifest" className={footerLinkClass}>
                    {messages.manifest.eyebrow}
                  </Link>
                </li>
                <li>
                  <Link href="#features" className={footerLinkClass}>
                    {messages.nav.features}
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className={footerLinkClass}>
                    {messages.nav.pricing}
                  </Link>
                </li>
                <li>
                  <Link href="#compare" className={footerLinkClass}>
                    {messages.comparison.eyebrow}
                  </Link>
                </li>
                <li>
                  <Link href="#faq" className={footerLinkClass}>
                    {messages.faq.eyebrow}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {messages.footer.account}
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                <li>
                  <Link href="/sign-in" className={footerLinkClass}>
                    {messages.nav.signIn}
                  </Link>
                </li>
                <li>
                  <Link href="/sign-up" className={footerLinkClass}>
                    {messages.nav.createAgent}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-border/50 pt-8 text-center text-xs text-muted-foreground sm:text-left">
          {messages.footer.rights}
        </div>
      </div>
    </footer>
  );
}
