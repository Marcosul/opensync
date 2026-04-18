"use client";

import { ChevronDown } from "lucide-react";

import { useHomeI18n } from "@/components/marketing/home-i18n";

export function FaqSection() {
  const { messages } = useHomeI18n();
  const { faq } = messages;

  return (
    <section
      id="faq"
      className="scroll-mt-24 border-t border-border/60 bg-muted/20 px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
    >
      <div className="mx-auto w-full max-w-[1360px]">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{faq.eyebrow}</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{faq.title}</h2>
          <p className="mt-4 text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">{faq.lead}</p>
        </header>

        <div className="mx-auto mt-12 max-w-3xl space-y-3">
          {faq.items.map((item) => (
            <details
              key={item.question}
              className="group rounded-xl border border-border bg-card/90 shadow-sm backdrop-blur-sm open:shadow-md"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-left text-base font-semibold text-foreground transition-colors hover:bg-muted/40 sm:p-6 [&::-webkit-details-marker]:hidden">
                <span className="pr-2">{item.question}</span>
                <ChevronDown
                  className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <div className="border-t border-border/60 px-5 pb-5 pt-4 text-sm leading-relaxed text-muted-foreground sm:px-6 sm:pb-6 sm:text-base">
                {item.answer}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
