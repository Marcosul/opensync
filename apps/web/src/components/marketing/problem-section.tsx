"use client";

import { useHomeI18n } from "@/components/marketing/home-i18n";

export function ProblemSection() {
  const { messages } = useHomeI18n();
  const { problem } = messages;

  return (
    <section
      id="problem"
      className="scroll-mt-24 border-t border-border/60 bg-[#F4F3EF] px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
    >
      <div className="mx-auto w-full max-w-[1360px]">
        <header className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{problem.eyebrow}</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {problem.title}
          </h2>
        </header>

        <div className="mt-8 max-w-3xl space-y-5 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          <p>{problem.intro1}</p>
          <p>{problem.intro2}</p>
        </div>

        <div className="mt-10 max-w-3xl rounded-xl border border-border/80 bg-card/60 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">{problem.compactionTitle}</h3>
          <ul className="mt-4 list-none space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {problem.compactionBullets.map((line) => (
              <li key={line} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <h3 className="mt-14 text-lg font-semibold text-foreground sm:text-xl">{problem.pathsTitle}</h3>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card/90 p-6 shadow-sm sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{problem.soloLabel}</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{problem.soloTitle}</p>
            <ul className="mt-4 list-none space-y-2.5 text-sm text-muted-foreground sm:text-base">
              {problem.soloLines.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-primary" aria-hidden>
                    →
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card/90 p-6 shadow-sm sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{problem.teamLabel}</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{problem.teamTitle}</p>
            <ul className="mt-4 list-none space-y-2.5 text-sm text-muted-foreground sm:text-base">
              {problem.teamLines.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-primary" aria-hidden>
                    →
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-6 max-w-3xl rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground sm:text-base">
          {problem.islandNote}
        </p>

        <div className="mt-10 max-w-3xl rounded-xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-primary">{problem.metaphorTitle}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{problem.metaphorBody}</p>
        </div>

        <p className="mt-10 max-w-3xl text-pretty text-base font-medium leading-relaxed text-foreground sm:text-lg">
          {problem.closing}
        </p>
      </div>
    </section>
  );
}
