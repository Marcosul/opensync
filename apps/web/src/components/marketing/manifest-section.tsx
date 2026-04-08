"use client";

import { useHomeI18n } from "@/components/marketing/home-i18n";

export function ManifestSection() {
  const { messages } = useHomeI18n();
  const { manifest } = messages;

  return (
    <section
      id="manifest"
      className="border-t border-border/60 bg-muted/30 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
    >
      <div className="mx-auto w-full max-w-[1360px]">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16 lg:items-start">
          <header className="max-w-xl lg:sticky lg:top-24">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {manifest.eyebrow}
            </p>
            <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {manifest.title}
            </h2>
            <p className="mt-5 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
              {manifest.lead}
            </p>
          </header>

          <ol className="flex flex-col gap-5 sm:gap-6">
            {manifest.principles.map((item, index) => (
              <li
                key={item.title}
                className="relative rounded-xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur-sm sm:p-6"
              >
                <span
                  className="absolute left-5 top-5 font-mono text-xs font-semibold tabular-nums text-primary/80 sm:left-6 sm:top-6"
                  aria-hidden
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="pl-10 sm:pl-12">
                  <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
