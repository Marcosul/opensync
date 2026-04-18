"use client";

import { useHomeI18n } from "@/components/marketing/home-i18n";

export function SolutionSection() {
  const { messages } = useHomeI18n();
  const { solution } = messages;

  return (
    <section
      id="solution"
      className="scroll-mt-24 border-t border-border/60 bg-background px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
    >
      <div className="mx-auto w-full max-w-[1360px]">
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{solution.eyebrow}</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {solution.title}
          </h2>
          <p className="mt-4 text-pretty text-lg font-semibold text-foreground/90 sm:text-xl">{solution.subtitle}</p>
          <p className="mt-3 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {solution.lead}
          </p>
        </header>

        <ul className="mt-10 grid list-none gap-4 sm:grid-cols-2 lg:gap-5">
          {solution.bullets.map((item) => (
            <li
              key={item}
              className="flex gap-4 rounded-xl border border-border bg-card/90 p-5 shadow-sm backdrop-blur-sm sm:p-6"
            >
              <span
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary"
                aria-hidden
              >
                ✓
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground sm:text-base">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
