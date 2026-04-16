"use client";

import { diffLines } from "diff";
import { File } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  original: string;
  proposed: string;
  filename: string;
};

const CONTEXT = 3;

type LineEntry = { type: "add" | "remove" | "context" | "hunk"; text: string };

function buildDiffLines(original: string, proposed: string): LineEntry[] {
  const changes = diffLines(original, proposed);

  // Expand changes into flat line list
  type RawLine = { type: "add" | "remove" | "context"; text: string };
  const flat: RawLine[] = [];
  for (const change of changes) {
    const texts = change.value.replace(/\n$/, "").split("\n");
    const type = change.added ? "add" : change.removed ? "remove" : "context";
    for (const text of texts) flat.push({ type, text });
  }

  if (flat.length === 0) return [];

  // Find indices of changed lines
  const changedIdx = new Set(
    flat
      .map((l, i) => (l.type !== "context" ? i : -1))
      .filter((i) => i >= 0),
  );

  if (changedIdx.size === 0) return [];

  // Build visible set: CONTEXT lines around each change, collapsed hunks for gaps
  const visible = new Set<number>();
  for (const idx of changedIdx) {
    for (let d = -CONTEXT; d <= CONTEXT; d++) {
      const j = idx + d;
      if (j >= 0 && j < flat.length) visible.add(j);
    }
  }

  const result: LineEntry[] = [];
  let prev = -1;
  const sorted = [...visible].sort((a, b) => a - b);
  for (const idx of sorted) {
    if (prev >= 0 && idx > prev + 1) {
      result.push({ type: "hunk", text: `@@ skipped ${idx - prev - 1} lines @@` });
    }
    result.push(flat[idx]);
    prev = idx;
  }
  return result;
}

export function AgentDiffView({ original, proposed, filename }: Props) {
  const lines = buildDiffLines(original, proposed);

  return (
    <div className="mt-1.5 overflow-hidden rounded border border-border font-mono text-[10px] leading-5">
      {/* header */}
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-2 py-1">
        <File className="size-2.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-muted-foreground">{filename}</span>
      </div>
      {/* diff body */}
      <div className="max-h-72 overflow-y-auto">
        {lines.length === 0 ? (
          <div className="px-3 py-2 text-muted-foreground/60">Sem alterações detectadas</div>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              className={cn(
                "flex min-w-0 gap-1.5 px-2",
                line.type === "add" &&
                  "bg-green-500/10 text-green-700 dark:bg-green-500/10 dark:text-green-400",
                line.type === "remove" &&
                  "bg-red-500/10 text-red-700 dark:bg-red-500/10 dark:text-red-400",
                line.type === "context" && "text-muted-foreground/60",
                line.type === "hunk" && "bg-blue-500/5 text-blue-500/70 italic",
              )}
            >
              <span className="w-3 shrink-0 select-none text-center opacity-70">
                {line.type === "add"
                  ? "+"
                  : line.type === "remove"
                    ? "-"
                    : line.type === "hunk"
                      ? "⋯"
                      : " "}
              </span>
              <span className="min-w-0 break-all whitespace-pre-wrap">{line.text || " "}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
