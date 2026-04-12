"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ConnectAgentSkillStep3Panel } from "@/components/onboarding/opensync-ubuntu-skill-instructions";
import { getPublicApiBaseUrlForClient } from "@/lib/opensync-public-urls";

const SKILL_DOC_PATH = "/docs/agent/opensync-skill";
const SKILL_MD_RAW_PATH = "/docs/agent/opensync-skill/skill-md";

export default function VaultGitSetupPage() {
  const params = useParams();
  const vaultId = typeof params.id === "string" ? params.id.trim() : "";

  const [appOrigin, setAppOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setAppOrigin(window.location.origin);
    }
  }, []);

  const skillGuideUrl = useMemo(
    () => (appOrigin ? `${appOrigin}${SKILL_DOC_PATH}` : SKILL_DOC_PATH),
    [appOrigin],
  );
  const skillMdUrl = useMemo(
    () => (appOrigin ? `${appOrigin}${SKILL_MD_RAW_PATH}` : SKILL_MD_RAW_PATH),
    [appOrigin],
  );
  const apiBaseUrl = useMemo(() => getPublicApiBaseUrlForClient(), []);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.alert("Nao foi possivel copiar. Selecione o texto manualmente.");
    }
  }, []);

  if (!vaultId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Vault invalido.</p>
        <Link href="/dashboard" className="mt-4 text-sm text-primary underline">
          Voltar ao dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-card/30 px-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Dashboard
        </Link>
        <span className="text-sm font-medium text-foreground/80">Ligar agente</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <section className="mx-auto w-full max-w-2xl space-y-8 rounded-2xl border bg-card p-5 shadow-sm sm:p-8">

          {/* ── Cabeçalho ── */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ubuntu + API
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Ligar o agente</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sincronize qualquer pasta do Ubuntu com este vault. Nas abas, escolha o app Ubuntu ou a skill OpenClaw.
            </p>
          </div>

          <ConnectAgentSkillStep3Panel
            skillGuideUrl={skillGuideUrl}
            skillMdUrl={skillMdUrl}
            apiBaseUrl={apiBaseUrl}
            vaultId={vaultId}
            onCopyBlock={(text) => void copy(text)}
          />
        </section>
      </div>
    </div>
  );
}
