"use client";

import Link from "next/link";

import { HeroSection, LandingBrandMark } from "@/components/marketing/hero-section";
import { ManifestSection } from "@/components/marketing/manifest-section";
import {
  HomeI18nProvider,
  LanguageDropdown,
  useHomeI18n,
} from "@/components/marketing/home-i18n";
import { LandingFooter } from "@/components/marketing/landing-footer";
import { ComparisonSection, PricingSection } from "@/components/marketing/pricing-section";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PublicHomePage() {
  return (
    <HomeI18nProvider>
      <PublicHomeContent />
    </HomeI18nProvider>
  );
}

function PublicHomeContent() {
  const { messages } = useHomeI18n();
  return (
    <div className="min-h-screen bg-[#F9F9F7]">
      <header className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-8">
        <LandingBrandMark className="min-w-0 shrink-0" />
        <div className="hidden items-center gap-5 md:flex">
          <Link href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {messages.nav.features}
          </Link>
          <Link href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {messages.nav.pricing}
          </Link>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3 lg:ml-auto lg:flex-nowrap">
          <div className="flex items-center justify-end gap-2 sm:gap-3">
            <LanguageDropdown />
            <Link
              href="/sign-in"
              className={cn(
                buttonVariants({ variant: "ghost", size: "lg" }),
                "shrink-0 text-sm sm:text-base",
              )}
            >
              {messages.nav.signIn}
            </Link>
          </div>
          <Link
            href="/sign-up"
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "w-full shrink-0 text-center text-sm sm:w-auto sm:text-base",
            )}
          >
            {messages.nav.createAgent}
          </Link>
        </div>
      </header>

      <main>
        <HeroSection />
        <ManifestSection />
        {/* <FeaturesSection /> */}
        <PricingSection />
        <ComparisonSection />
      </main>

      <LandingFooter />
    </div>
  );
}
