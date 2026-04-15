"use client";

import { FileCode2, LayoutList } from "lucide-react";
import { useMemo, useState } from "react";

import { VaultCodeEditor } from "@/components/app/vault-code-editor";
import { cn } from "@/lib/utils";

export type VaultJsonlViewerProps = {
  docId: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
};

type ParsedLine = {
  lineIndex: number;
  raw: string;
  parsed: unknown | null;
  error?: string;
};

function parseJsonlLines(text: string): ParsedLine[] {
  const lines = text.split("\n");
  const out: ParsedLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw === "" && i === lines.length - 1) break;
    if (raw === "") {
      out.push({ lineIndex: i + 1, raw, parsed: null, error: "empty" });
      continue;
    }
    try {
      out.push({ lineIndex: i + 1, raw, parsed: JSON.parse(raw) as unknown });
    } catch {
      out.push({ lineIndex: i + 1, raw, parsed: null, error: "invalid_json" });
    }
  }
  return out;
}

function inferEntryLabel(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return typeof obj === "string" ? "string" : typeof obj;
  }
  const o = obj as Record<string, unknown>;
  if (typeof o.type === "string" && o.type.trim()) return o.type;
  if (typeof o.role === "string" && o.role.trim()) return o.role;
  if (typeof o.status === "string" && o.status.trim()) return `status:${o.status}`;
  return "object";
}

function badgeClassForLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("assistant") || lower === "message") {
    return "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200";
  }
  if (lower.includes("user")) {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
  }
  if (lower.includes("tool") || lower.includes("result")) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200";
  }
  if (lower.includes("error") || lower.includes("failed")) {
    return "border-destructive/40 bg-destructive/10 text-destructive";
  }
  if (lower.includes("system")) {
    return "border-violet-500/40 bg-violet-500/10 text-violet-900 dark:text-violet-200";
  }
  if (lower.startsWith("status:")) {
    return "border-muted-foreground/40 bg-muted/50 text-muted-foreground";
  }
  return "border-border bg-muted/40 text-foreground";
}

function borderClassForLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes("assistant") || lower === "message") return "border-l-sky-500";
  if (lower.includes("user")) return "border-l-emerald-500";
  if (lower.includes("tool") || lower.includes("result")) return "border-l-amber-500";
  if (lower.includes("error") || lower.includes("failed")) return "border-l-destructive";
  if (lower.includes("system")) return "border-l-violet-500";
  if (lower.startsWith("status:")) return "border-l-muted-foreground";
  return "border-l-border";
}

export function VaultJsonlViewer({ docId, value, onChange, className }: VaultJsonlViewerProps) {
  const [mode, setMode] = useState<"structured" | "raw">("structured");

  const rows = useMemo(() => parseJsonlLines(value), [value]);
  const stats = useMemo(() => {
    const bad = rows.filter((r) => r.error).length;
    return { bad, total: rows.length };
  }, [rows]);

  if (mode === "raw") {
    return (
      <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3", className)}>
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-px">
          <p className="font-mono text-[11px] text-muted-foreground sm:text-xs">JSONL · editor</p>
          <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setMode("structured")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium sm:text-xs",
                "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              )}
              aria-pressed={false}
            >
              <LayoutList className="size-3.5 shrink-0" aria-hidden />
              Linhas
            </button>
            <button
              type="button"
              onClick={() => setMode("raw")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium sm:text-xs",
                "bg-background text-foreground shadow-sm",
              )}
              aria-pressed
            >
              <FileCode2 className="size-3.5 shrink-0" aria-hidden />
              Fonte
            </button>
          </div>
        </div>
        <VaultCodeEditor
          docId={docId}
          value={value}
          onChange={onChange}
          className="mx-auto min-h-0 w-full max-w-[min(100%,56rem)] flex-1"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3 overflow-y-auto",
        className,
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-px">
        <p className="font-mono text-[11px] text-muted-foreground sm:text-xs">
          JSONL · {stats.total} linha{stats.total === 1 ? "" : "s"}
          {stats.bad > 0 ? (
            <span className="text-destructive"> · {stats.bad} inválida{stats.bad === 1 ? "" : "s"}</span>
          ) : null}
        </p>
        <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setMode("structured")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium sm:text-xs",
              "bg-background text-foreground shadow-sm",
            )}
            aria-pressed
          >
            <LayoutList className="size-3.5 shrink-0" aria-hidden />
            Linhas
          </button>
          <button
            type="button"
            onClick={() => setMode("raw")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium sm:text-xs",
              "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            )}
            aria-pressed={false}
          >
            <FileCode2 className="size-3.5 shrink-0" aria-hidden />
            Fonte
          </button>
        </div>
      </div>

      <ul className="mx-auto flex w-full max-w-[min(100%,56rem)] flex-col gap-0 sm:gap-2">
        {rows.map((row) => {
          const label =
            row.error === "empty"
              ? "vazio"
              : row.error
                ? "JSON inválido"
                : inferEntryLabel(row.parsed);
          const pretty =
            row.parsed !== null && !row.error
              ? JSON.stringify(row.parsed, null, 2)
              : row.raw;

          return (
            <li
              key={row.lineIndex}
              className={cn(
                "rounded-r-md border border-border border-l-4 bg-card/40 p-2.5 sm:p-3",
                row.error ? "border-l-destructive" : borderClassForLabel(label),
              )}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
                  #{row.lineIndex}
                </span>
                <span
                  className={cn(
                    "inline-flex max-w-full items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide sm:text-[11px]",
                    badgeClassForLabel(label),
                  )}
                >
                  {label}
                </span>
              </div>
              <pre
                className={cn(
                  "max-h-[min(24rem,50vh)] overflow-auto rounded-md bg-muted/50 p-2.5 font-mono text-[11px] leading-relaxed text-foreground sm:text-xs",
                  row.error && "text-destructive",
                )}
              >
                {pretty}
              </pre>
            </li>
          );
        })}
      </ul>

      {rows.length === 0 ? (
        <p className="mx-auto w-full max-w-[min(100%,56rem)] font-mono text-xs text-muted-foreground">
          Ficheiro vazio.
        </p>
      ) : null}
    </div>
  );
}
