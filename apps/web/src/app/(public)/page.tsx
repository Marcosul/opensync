"use client";

import Link from "next/link";

import { HeroSection, LandingBrandMark } from "@/components/marketing/hero-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { ManifestSection } from "@/components/marketing/manifest-section";
import { ProblemSection } from "@/components/marketing/problem-section";
import { SolutionSection } from "@/components/marketing/solution-section";
import {
  HomeI18nProvider,
  LanguageDropdown,
  useHomeI18n,
} from "@/components/marketing/home-i18n";
import { LandingFooter } from "@/components/marketing/landing-footer";
import { FaqSection } from "@/components/marketing/faq-section";
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
      <header className="mx-auto flex w-full max-w-[1360px] flex-row flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-5 sm:px-6 lg:gap-4 lg:px-8">
        <LandingBrandMark className="min-w-0 shrink-0" />
        <nav className="hidden min-w-0 items-center gap-5 md:flex md:flex-1 md:justify-center">
          <Link href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {messages.nav.features}
          </Link>
          <Link href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {messages.nav.pricing}
          </Link>
        </nav>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
          <div className="hidden md:block">
            <LanguageDropdown />
          </div>
          <Link
            href="/sign-in"
            className={cn(
              buttonVariants({ variant: "ghost", size: "lg" }),
              "shrink-0 text-sm sm:text-base",
            )}
          >
            {messages.nav.signIn}
          </Link>
          <Link
            href="/sign-up"
            className={cn(
              buttonVariants({ variant: "default", size: "lg" }),
              "hidden shrink-0 text-center text-sm md:inline-flex md:w-auto md:text-base",
            )}
          >
            {messages.nav.createAgent}
          </Link>
        </div>
      </header>

      <main>
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        {/* Âncora para #features (nav, hero, rodapé): a secção de features está desativada; o manifesto segue a seguir. */}
        <div id="features" className="scroll-mt-24" />
        <HowItWorksSection />
        <ManifestSection />
        {/* <FeaturesSection /> */}
        <PricingSection />
        <ComparisonSection />
        <FaqSection />
      </main>

      <LandingFooter />
    </div>
  );
}
