"use client";

import {
  Braces,
  Code2,
  File,
  FileCode2,
  FileJson,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  ScrollText,
  Terminal,
} from "lucide-react";
import type { LucideProps } from "lucide-react";
import type { ForwardRefExoticComponent, RefAttributes } from "react";

import { cn } from "@/lib/utils";
import type { VaultExplorerFileKind } from "@/lib/vault-file-visual";
import { vaultExplorerFileKind } from "@/lib/vault-file-visual";

type IconComp = ForwardRefExoticComponent<
  Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
>;

const KIND_STYLES: Record<VaultExplorerFileKind, { Icon: IconComp; className: string }> = {
  markdown: {
    Icon: FileText,
    className: "text-sky-600 dark:text-sky-400",
  },
  json: {
    Icon: FileJson,
    className: "text-amber-600 dark:text-amber-400",
  },
  python: {
    Icon: FileTerminal,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  javascript: {
    Icon: Braces,
    className: "text-yellow-600 dark:text-yellow-400",
  },
  typescript: {
    Icon: Braces,
    className: "text-blue-600 dark:text-blue-400",
  },
  html: {
    Icon: Code2,
    className: "text-orange-600 dark:text-orange-400",
  },
  css: {
    Icon: FileCode2,
    className: "text-violet-600 dark:text-violet-400",
  },
  data: {
    Icon: FileSpreadsheet,
    className: "text-green-600 dark:text-green-400",
  },
  yaml: {
    Icon: FileJson,
    className: "text-purple-600 dark:text-purple-400",
  },
  shell: {
    Icon: Terminal,
    className: "text-lime-700 dark:text-lime-400",
  },
  log: {
    Icon: ScrollText,
    className: "text-muted-foreground",
  },
  text: {
    Icon: FileText,
    className: "text-muted-foreground",
  },
  code: {
    Icon: FileCode2,
    className: "text-indigo-600 dark:text-indigo-400",
  },
  file: {
    Icon: File,
    className: "text-muted-foreground/80",
  },
};

type VaultExplorerFileIconProps = {
  /** Nome do ficheiro (com extensão), ex.: `config.json`. */
  fileName: string;
  active?: boolean;
  className?: string;
  size?: number;
};

/** Ícone por tipo de ficheiro (cores inspiradas em exploradores estilo VS Code). */
export function VaultExplorerFileIcon({
  fileName,
  active,
  className,
  size = 14,
}: VaultExplorerFileIconProps) {
  const kind = vaultExplorerFileKind(fileName);
  const { Icon, className: strokeClass } = KIND_STYLES[kind];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center [&_svg]:pointer-events-none",
        active ? "opacity-100" : "opacity-90",
        className,
      )}
      aria-hidden
    >
      <Icon className={strokeClass} size={size} strokeWidth={2} />
    </span>
  );
}
