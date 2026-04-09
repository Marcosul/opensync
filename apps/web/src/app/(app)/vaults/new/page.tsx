"use client";

import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/api/rest/generic";
import {
  blankVaultSnapshot,
  readVaultMetas,
  saveSnapshot,
  writeActiveVaultId,
  writePendingActiveVaultId,
  writePendingAgentProject,
  writeVaultMetas,
} from "@/components/app/vault-persistence";
import { ConnectAgentSkillStep3Panel } from "@/components/onboarding/opensync-agent-skill-instructions";
import { Button } from "@/components/ui/button";
import { getPublicApiBaseUrlForClient } from "@/lib/opensync-public-urls";
import type { VaultListItem } from "@/lib/vault-list-types";
import { cn } from "@/lib/utils";

const vaultNameInputClass =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

const VAULT_NAME_MAX = 120;
const SQUAD_MISSION_MAX = 8000;
const TOTAL_STEPS = 3;

const SKILL_DOC_PATH = "/docs/agent/opensync-skill";
const SKILL_MD_RAW_PATH = "/docs/agent/opensync-skill/skill-md";

type StartChoice = "agent_project" | "connect_agent" | "empty_vault";
type AgentProjectScope = "single_agent" | "agent_squad";

type ConnectAgentSetup = {
  vault: VaultListItem;
  token: string;
};

const agentProjectScopeOptions: { id: AgentProjectScope; label: string; hint: string }[] = [
  {
    id: "single_agent",
    label: "Criar apenas 1 agente",
    hint: "Um unico agente para o seu fluxo.",
  },
  {
    id: "agent_squad",
    label: "Um esquadrão de agentes",
    hint: "Varios agentes com missao compartilhada em MISSION.md.",
  },
];

const startOptions: { id: StartChoice; label: string; hint: string }[] = [
  {
    id: "agent_project",
    label: "Criar um projeto de Agente",
    hint: "Passo a passo com objetivos, contexto e configuracao inicial.",
  },
  {
    id: "connect_agent",
    label: "Conectar com meu agente OpenClaw",
    hint: "Instale a skill OpenSync no agente, use a API key e o endpoint da API para sincronizar com o repo Gitea do vault.",
  },
  {
    id: "empty_vault",
    label: "Criar um Vault Vazio",
    hint: "Abrir o explorador sem conectar um agente agora.",
  },
];

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.alert("Nao foi possivel copiar. Selecione o texto manualmente.");
  }
}

export default function NewVaultPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [vaultName, setVaultName] = useState("");
  const [startChoice, setStartChoice] = useState<StartChoice>("connect_agent");
  const [agentProjectScope, setAgentProjectScope] = useState<AgentProjectScope>("single_agent");
  const [squadMission, setSquadMission] = useState("");
  const [connectAgentSetup, setConnectAgentSetup] = useState<ConnectAgentSetup | null>(null);

  useEffect(() => {
    if (startChoice !== "agent_project") {
      setAgentProjectScope("single_agent");
      setSquadMission("");
    }
  }, [startChoice]);

  useEffect(() => {
    if (startChoice !== "connect_agent") {
      setConnectAgentSetup(null);
    }
  }, [startChoice]);

  const nameOk = vaultName.trim().length > 0;

  const agentProjectStep2Ok =
    startChoice !== "agent_project" ||
    agentProjectScope === "single_agent" ||
    (agentProjectScope === "agent_squad" && squadMission.trim().length > 0);

  const canContinueStep1 = true;
  const canContinueStep2 = nameOk && agentProjectStep2Ok;

  const selectedStartLabel = useMemo(
    () => startOptions.find((o) => o.id === startChoice)?.label ?? "",
    [startChoice],
  );

  const skillGuideAbsoluteUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return SKILL_DOC_PATH;
    }
    return `${window.location.origin}${SKILL_DOC_PATH}`;
  }, [step, connectAgentSetup]);

  const skillMdAbsoluteUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return SKILL_MD_RAW_PATH;
    }
    return `${window.location.origin}${SKILL_MD_RAW_PATH}`;
  }, [step, connectAgentSetup]);

  const isConnectAgentStep3 = step === 3 && startChoice === "connect_agent";
  const isConnectAgentStep2Submitting = step === 2 && startChoice === "connect_agent" && isSubmitting;

  function formatSubmitError(raw: string): string {
    try {
      const parsed = JSON.parse(raw) as { error?: string; message?: string };
      if (typeof parsed.error === "string" && parsed.error) return parsed.error;
      if (typeof parsed.message === "string" && parsed.message) return parsed.message;
    } catch {
      // keep raw message
    }
    return raw;
  }

  function pushVaultToMetasAndLocal(vault: VaultListItem) {
    const metas = readVaultMetas();
    if (!metas.some((m) => m.id === vault.id)) {
      metas.push({
        id: vault.id,
        name: vault.name,
        pathLabel: vault.pathLabel,
        kind: vault.kind,
        managedByProfile: vault.managedByProfile,
        deletable: vault.deletable,
        remoteSync: vault.remoteSync ?? "git",
      });
      writeVaultMetas(metas);
    }
    saveSnapshot(vault.id, blankVaultSnapshot());
    writeActiveVaultId(vault.id);
    writePendingActiveVaultId(vault.id);
  }

  async function runConnectAgentSetupFromStep2() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const { vault } = await apiRequest<{ vault: VaultListItem }>("/api/vaults/empty", {
        method: "POST",
        body: { vaultName: vaultName.trim() },
      });
      try {
        const tokenRes = await apiRequest<{ token: string; vaultId: string; agentId: string }>(
          `/api/vaults/${encodeURIComponent(vault.id)}/agent-token`,
          { method: "POST" },
        );
        pushVaultToMetasAndLocal(vault);
        setConnectAgentSetup({ vault, token: tokenRes.token });
        setStep(3);
      } catch (tokenErr) {
        pushVaultToMetasAndLocal(vault);
        const msg =
          tokenErr instanceof Error ? tokenErr.message : "Falha ao gerar API key.";
        setSubmitError(
          `${formatSubmitError(msg)} O vault foi criado. Gere a API key em Dashboard → Agente e Git (este cofre).`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel criar o vault.";
      setSubmitError(formatSubmitError(message));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveEmptyVault() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const { vault } = await apiRequest<{ vault: VaultListItem }>("/api/vaults/empty", {
        method: "POST",
        body: { vaultName: vaultName.trim() },
      });
      const metas = readVaultMetas();
      if (!metas.some((m) => m.id === vault.id)) {
        metas.push({
          id: vault.id,
          name: vault.name,
          pathLabel: vault.pathLabel,
          kind: vault.kind,
          managedByProfile: vault.managedByProfile,
          deletable: vault.deletable,
          remoteSync: vault.remoteSync ?? "git",
        });
        writeVaultMetas(metas);
      }
      saveSnapshot(vault.id, blankVaultSnapshot());
      writeActiveVaultId(vault.id);
      writePendingActiveVaultId(vault.id);
      router.push(`/vault?vaultId=${encodeURIComponent(vault.id)}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel salvar o vault.";
      setSubmitError(formatSubmitError(message));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePrimaryAction() {
    if (step === 3 && startChoice === "connect_agent" && connectAgentSetup) {
      router.push(`/vault?vaultId=${encodeURIComponent(connectAgentSetup.vault.id)}`);
      return;
    }

    if (step < TOTAL_STEPS) {
      if (step === 1 && !canContinueStep1) return;
      if (step === 2 && !canContinueStep2) return;

      if (step === 2 && startChoice === "connect_agent") {
        void runConnectAgentSetupFromStep2();
        return;
      }

      setStep((s) => Math.min(TOTAL_STEPS, s + 1));
      return;
    }

    if (startChoice === "agent_project") {
      writePendingAgentProject({
        vaultName: vaultName.trim(),
        projectType: agentProjectScope,
        squadMission:
          agentProjectScope === "agent_squad" ? squadMission.trim() : undefined,
      });
      router.push("/onboarding");
      return;
    }
    void handleSaveEmptyVault();
  }

  function handleBack() {
    if (step === 3 && startChoice === "connect_agent" && connectAgentSetup) {
      router.push("/dashboard");
      return;
    }
    if (step <= 1) {
      router.push("/dashboard");
      return;
    }
    setStep((s) => s - 1);
    setSubmitError(null);
  }

  const primaryLabel =
    step === 3 && startChoice === "connect_agent" && connectAgentSetup
      ? "SKILL instalada"
      : step < TOTAL_STEPS
        ? step === 2 && startChoice === "connect_agent"
          ? isSubmitting
            ? "criando vault…"
            : "Continuar"
          : "Continuar"
        : startChoice === "agent_project"
          ? "Ir para onboarding"
          : isSubmitting
            ? "Criando..."
            : "Criar e abrir o vault";

  const primaryDisabled =
    step === 3 && startChoice === "connect_agent" && connectAgentSetup
      ? false
      : step === 1
        ? !canContinueStep1
        : step === 2
          ? !canContinueStep2 || (startChoice === "connect_agent" && isSubmitting)
          : isSubmitting;

  const stepTitle =
    step === 1
      ? "Como deseja começar?"
      : step === 2
        ? "Nome"
        : startChoice === "empty_vault"
          ? isSubmitting
            ? "Criando seu vault"
            : "Confirmar criacao"
          : startChoice === "connect_agent"
            ? "Instalar a skill no agente"
            : "Confirmar criacao";

  const stepDescription =
    step === 1
      ? "Selecione o caminho que melhor descreve o que voce quer fazer agora."
      : step === 2
        ? startChoice === "connect_agent"
          ? "Escolha o nome do vault e continue: criamos o cofre no Gitea e a API key antes de mostrar o guia da skill."
          : "Escolha um nome para identificar este vault no dashboard."
        : startChoice === "connect_agent"
          ? "Envie ao agente o link do guia. Use as variáveis abaixo no ambiente do OpenClaw. Quando a skill estiver instalada, abra o explorador."
          : startChoice === "agent_project"
            ? "Para este fluxo voce nao precisa informar acesso agora. O onboarding guia objetivos, contexto e a conexao na ultima etapa."
            : isSubmitting
              ? "Aguarde enquanto registramos o vault e criamos o repositorio remoto no Gitea."
              : `O vault "${vaultName.trim() || "…"}" sera criado no servidor (banco de dados + repositorio no Gitea) quando voce confirmar. Depois voce entra no explorador; conectar um agente pode ser feito depois.`;

  const isEmptyVaultStep3 = step === 3 && startChoice === "empty_vault";
  const isEmptyVaultCreating = isEmptyVaultStep3 && isSubmitting;

  const headerEyebrow =
    step === 3 && startChoice === "connect_agent" && connectAgentSetup
      ? "OpenClaw — Skill"
      : isConnectAgentStep2Submitting
        ? "OpenClaw — criando vault"
        : isEmptyVaultCreating
          ? "Vault vazio — Criando"
          : isEmptyVaultStep3
            ? "Vault vazio — Confirmar"
            : `Adicionar vault — Etapa ${step} de ${TOTAL_STEPS}`;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-card/30 px-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Voltar
        </Link>
        <span className="text-sm font-medium text-foreground/80">Novo vault</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <section className="mx-auto w-full max-w-2xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{headerEyebrow}</p>
          {step === 2 ? (
            <div className="mt-3 rounded-lg border border-border bg-muted/25 px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Como deseja começar?
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">{selectedStartLabel}</p>
            </div>
          ) : null}
          <h1
            className={cn("text-2xl font-semibold tracking-tight", step === 2 ? "mt-4" : "mt-2")}
          >
            {stepTitle}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{stepDescription}</p>

          <div className="mt-6">
            {step === 1 ? (
              <div className="space-y-2">
                {startOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setStartChoice(opt.id)}
                    className={cn(
                      "flex w-full flex-col rounded-xl border p-3 text-left text-sm transition-colors",
                      startChoice === opt.id
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:bg-muted/50",
                    )}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.hint}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-6">
                <div>
                  <label htmlFor="vault-name" className="block text-sm font-medium text-foreground">
                    Nome do vault
                  </label>
                  <input
                    id="vault-name"
                    type="text"
                    autoComplete="off"
                    placeholder="Ex.: Projeto pessoal, Cliente X"
                    maxLength={VAULT_NAME_MAX}
                    value={vaultName}
                    onChange={(e) => setVaultName(e.target.value)}
                    disabled={isConnectAgentStep2Submitting}
                    className={vaultNameInputClass}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ate {VAULT_NAME_MAX} caracteres. Usado no dashboard e ao conectar o agente.
                  </p>
                </div>

                {isConnectAgentStep2Submitting ? (
                  <div
                    className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3 text-sm text-muted-foreground"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
                    criando vault…
                  </div>
                ) : null}

                {startChoice === "agent_project" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-foreground">Estrutura do projeto</h3>
                      <div className="space-y-2">
                        {agentProjectScopeOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setAgentProjectScope(opt.id)}
                            className={cn(
                              "flex w-full flex-col rounded-xl border p-3 text-left text-sm transition-colors",
                              agentProjectScope === opt.id
                                ? "border-primary bg-primary/10"
                                : "border-border bg-background hover:bg-muted/50",
                            )}
                          >
                            <span className="font-medium">{opt.label}</span>
                            <span className="text-xs text-muted-foreground">{opt.hint}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {agentProjectScope === "agent_squad" ? (
                      <div>
                        <label
                          htmlFor="squad-mission"
                          className="block text-sm font-medium text-foreground"
                        >
                          Missão da equipe
                        </label>
                        <textarea
                          id="squad-mission"
                          rows={6}
                          maxLength={SQUAD_MISSION_MAX}
                          value={squadMission}
                          onChange={(e) => setSquadMission(e.target.value)}
                          placeholder="Descreva objetivos, escopo e como os agentes devem colaborar..."
                          className={cn(
                            vaultNameInputClass,
                            "min-h-[140px] resize-y font-sans leading-relaxed",
                          )}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          O arquivo <span className="font-mono">MISSION.md</span> sera criado
                          automaticamente no explorador com este texto quando voce abrir o vault.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {isConnectAgentStep3 && connectAgentSetup ? (
              <ConnectAgentSkillStep3Panel
                skillGuideUrl={skillGuideAbsoluteUrl}
                skillMdUrl={skillMdAbsoluteUrl}
                apiBaseUrl={getPublicApiBaseUrlForClient()}
                vaultId={connectAgentSetup.vault.id}
                agentApiKey={connectAgentSetup.token}
                onCopyBlock={(text) => void copyToClipboard(text)}
              />
            ) : null}

            {isEmptyVaultStep3 ? (
              isEmptyVaultCreating ? (
                <div
                  className="relative flex flex-col items-center overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/[0.07] via-card to-muted/30 py-14 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/15 via-primary/[0.06] to-transparent"
                    aria-hidden
                  />
                  <div className="relative mb-8 flex flex-col items-center">
                    <div className="absolute size-24 rounded-full bg-primary/10 blur-xl" aria-hidden />
                    <div className="relative">
                      <span
                        className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-duration:2.2s]"
                        aria-hidden
                      />
                      <div className="relative flex size-[4.5rem] items-center justify-center rounded-full border-2 border-primary/30 border-t-primary bg-background/90 shadow-md backdrop-blur-sm">
                        <Loader2 className="size-9 animate-spin text-primary" strokeWidth={1.75} />
                      </div>
                    </div>
                  </div>
                  <p className="relative max-w-sm text-base font-semibold tracking-tight text-foreground">
                    Criando repositorio e registrando o vault
                  </p>
                  <p className="relative mt-3 max-w-[22rem] px-2 text-sm leading-relaxed text-muted-foreground">
                    Conectando ao servidor, preparando o Git no Gitea e abrindo seu explorador em
                    seguida.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center rounded-xl border border-border bg-muted/30 py-10 text-center">
                  <div
                    className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-sm"
                    aria-hidden
                  >
                    <CheckCircle2 className="size-9" strokeWidth={1.75} />
                  </div>
                  <p className="mt-5 max-w-sm text-sm font-medium text-foreground">
                    Pronto para criar o vault vazio
                  </p>
                  <p className="mt-2 max-w-xs text-xs text-muted-foreground">
                    Ao confirmar, criamos o registro e o repositorio remoto. Nenhuma conexao com agente e
                    necessaria agora; voce abre o explorador em seguida.
                  </p>
                </div>
              )
            ) : null}
          </div>

          {submitError ? (
            <p className="mt-4 text-sm text-destructive">{submitError}</p>
          ) : null}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={isConnectAgentStep2Submitting}
              onClick={handleBack}
            >
              {step === 3 && startChoice === "connect_agent" && connectAgentSetup
                ? "Ir ao dashboard"
                : step === 1
                  ? "Cancelar"
                  : "Voltar"}
            </Button>
            <Button
              type="button"
              onClick={handlePrimaryAction}
              disabled={primaryDisabled}
            >
              {primaryLabel}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
