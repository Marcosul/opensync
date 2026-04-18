"use client";

import { useHomeI18n } from "@/components/marketing/home-i18n";

export function HowItWorksSection() {
  const { messages } = useHomeI18n();
  const { howItWorks } = messages;

  return (
    <section
      id="how-it-works"
      className="scroll-mt-24 border-t border-border/60 bg-background px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
    >
      <div className="mx-auto w-full max-w-[1360px]">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{howItWorks.eyebrow}</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {howItWorks.title}
          </h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {howItWorks.lead}
          </p>
        </header>

        <ul className="mt-12 grid list-none gap-4 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4 lg:gap-5">
          {howItWorks.cards.map((card, index) => (
            <li
              key={card.title}
              className="flex flex-col rounded-xl border border-border bg-card/90 p-5 shadow-sm backdrop-blur-sm sm:p-6"
            >
              <span
                className="font-mono text-xs font-semibold tabular-nums text-primary/80"
                aria-hidden
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-foreground">{card.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground sm:text-base">{card.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
