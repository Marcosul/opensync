"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";

type SkillDocCopyProps = {
  skillMarkdown: string;
  guidePageUrl: string;
  skillMdUrl: string;
};

export function SkillDocCopyActions({ skillMarkdown, guidePageUrl, skillMdUrl }: SkillDocCopyProps) {
  const [done, setDone] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setDone(msg);
    window.setTimeout(() => setDone(null), 2500);
  }, []);

  const copy = useCallback(
    async (text: string, msg: string) => {
      try {
        await navigator.clipboard.writeText(text);
        flash(msg);
      } catch {
        window.alert("Nao foi possivel copiar. Selecione o texto manualmente.");
      }
    },
    [flash],
  );

  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Button type="button" size="sm" variant="outline" onClick={() => void copy(skillMarkdown, "SKILL.md copiado")}>
        Copiar conteúdo do SKILL.md
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => void copy(skillMdUrl, "URL do ficheiro copiada")}>
        Copiar URL do ficheiro SKILL.md
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => void copy(guidePageUrl, "URL do guia copiada")}>
        Copiar URL desta página
      </Button>
      <a
        href={skillMdUrl}
        download="SKILL.md"
        className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium hover:bg-muted"
      >
        Descarregar SKILL.md
      </a>
      {done ? <span className="self-center text-xs text-muted-foreground">{done}</span> : null}
    </div>
  );
}
