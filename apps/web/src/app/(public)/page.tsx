"use client";

import Link from "next/link";

import { FeaturesSection } from "@/components/marketing/features-section";
import { HeroSection, LandingBrandMark } from "@/components/marketing/hero-section";
import {
  HomeI18nProvider,
  LanguageDropdown,
  useHomeI18n,
} from "@/components/marketing/home-i18n";
import { PricingSection } from "@/components/marketing/pricing-section";
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
      <header className="mx-auto flex w-full max-w-[1360px] items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <LandingBrandMark className="min-w-0 shrink" />
        <div className="hidden items-center gap-5 md:flex">
          <Link href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {messages.nav.features}
          </Link>
          <Link href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            {messages.nav.pricing}
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageDropdown />
          <Link
            href="/sign-in"
            className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "text-sm sm:text-base")}
          >
            {messages.nav.signIn}
          </Link>
          <Link
            href="/sign-up"
            className={cn(buttonVariants({ variant: "default", size: "lg" }), "text-sm sm:text-base")}
          >
            {messages.nav.createAgent}
          </Link>
        </div>
      </header>

      <main>
        <HeroSection />
        <FeaturesSection />
        <PricingSection />
      </main>
    </div>
  );
}
