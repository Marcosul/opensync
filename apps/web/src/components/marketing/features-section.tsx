"use client";

import {
  Download,
  FileText,
  Home,
  Languages,
  Network,
  Puzzle,
} from "lucide-react";

import { useHomeI18n } from "@/components/marketing/home-i18n";
import { cn } from "@/lib/utils";
const featureIcons = [Download, Network, FileText, Home, Puzzle, Languages];
const featureIconBg = [
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400",
];

export function FeaturesSection() {
  const { messages } = useHomeI18n();
  const featureItems = messages.features.items.map((item, index) => ({
    ...item,
    icon: featureIcons[index],
    iconBg: featureIconBg[index],
  }));
  return (
    <section
      id="features"
      className="bg-transparent px-4 py-16 sm:px-6 sm:py-20 lg:px-8"
    >
      <div className="mx-auto w-full max-w-[1360px]">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {messages.features.eyebrow}
          </p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {messages.features.title}
          </h2>
        </div>

        <ul className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {featureItems.map((item) => (
            <li
              key={item.title}
              className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div
                className={cn(
                  "mb-4 flex size-10 items-center justify-center rounded-lg",
                  item.iconBg
                )}
              >
                <item.icon className="size-5" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
