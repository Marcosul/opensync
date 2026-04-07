"use client";

import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/api/rest/generic";
import {
  writePendingActiveVaultId,
  writePendingAgentProject,
} from "@/components/app/vault-persistence";
import { AgentConnectionStep } from "@/components/onboarding/agent-connection-step";
import { Button } from "@/components/ui/button";
import {
  buildAgentConnectionPayload,
  isAgentConnectionValid,
  type AgentConnectionForm,
} from "@/lib/onboarding-agent";
import type { VaultListItem } from "@/lib/vault-list-types";
import { cn } from "@/lib/utils";

const defaultAgentFields: AgentConnectionForm = {
  agentMode: "gateway",
  gatewayUrl: "",
  gatewayToken: "",
  sshHost: "",
  sshPort: "22",
  sshUser: "",
  sshPrivateKey: "",
  sshPassword: "",
};

const vaultNameInputClass =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

const VAULT_NAME_MAX = 120;
const SQUAD_MISSION_MAX = 8000;
const TOTAL_STEPS = 3;

type StartChoice = "agent_project" | "connect_agent" | "empty_vault";
type AgentProjectScope = "single_agent" | "agent_squad";

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
    label: "Conectar com meu agente",
    hint: "Gateway, token ou SSH para sincronizar com um ambiente existente.",
  },
  {
    id: "empty_vault",
    label: "Criar um Vault Vazio",
    hint: "Abrir o explorador sem conectar um agente agora.",
  },
];

export default function NewVaultPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [vaultName, setVaultName] = useState("");
  const [startChoice, setStartChoice] = useState<StartChoice>("connect_agent");
  const [agentProjectScope, setAgentProjectScope] = useState<AgentProjectScope>("single_agent");
  const [squadMission, setSquadMission] = useState("");
  const [form, setForm] = useState<AgentConnectionForm>(defaultAgentFields);

  useEffect(() => {
    if (startChoice !== "agent_project") {
      setAgentProjectScope("single_agent");
      setSquadMission("");
    }
  }, [startChoice]);

  const nameOk = vaultName.trim().length > 0;

  const agentProjectStep2Ok =
    startChoice !== "agent_project" ||
    agentProjectScope === "single_agent" ||
    (agentProjectScope === "agent_squad" && squadMission.trim().length > 0);

  const canContinueStep1 = true;
  const canContinueStep2 = nameOk && agentProjectStep2Ok;
  const canFinishStep3 = useMemo(() => {
    if (startChoice === "connect_agent") return isAgentConnectionValid(form);
    return true;
  }, [form, startChoice]);

  const selectedStartLabel = useMemo(
    () => startOptions.find((o) => o.id === startChoice)?.label ?? "",
    [startChoice],
  );

  async function handleConnectAgent() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const agentConnection = buildAgentConnectionPayload(form);
      if (!agentConnection) {
        setSubmitError("Preencha os dados de conexao do agente.");
        return;
      }
      await apiRequest<{ ok: boolean }>("/api/vaults/connect", {
        method: "POST",
        body: { agentConnection, vaultName: vaultName.trim() },
      });
      router.replace("/dashboard");
    } catch (error) {
      let message =
        error instanceof Error ? error.message : "Nao foi possivel conectar o vault.";
      try {
        const parsed = JSON.parse(message) as { error?: string };
        if (parsed.error) {
          message = parsed.error;
        }
      } catch {
        // keep raw message
      }
      setSubmitError(message);
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
      writePendingActiveVaultId(vault.id);
      router.push("/vault");
    } catch (error) {
      let message =
        error instanceof Error ? error.message : "Nao foi possivel salvar o vault.";
      try {
        const parsed = JSON.parse(message) as { error?: string };
        if (parsed.error) {
          message = parsed.error;
        }
      } catch {
        // keep raw message
      }
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePrimaryAction() {
    if (step < TOTAL_STEPS) {
      if (step === 1 && !canContinueStep1) return;
      if (step === 2 && !canContinueStep2) return;
      setStep((s) => Math.min(TOTAL_STEPS, s + 1));
      return;
    }

    if (startChoice === "connect_agent") {
      void handleConnectAgent();
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
    if (step <= 1) {
      router.push("/dashboard");
      return;
    }
    setStep((s) => s - 1);
    setSubmitError(null);
  }

  const primaryLabel =
    step < TOTAL_STEPS
      ? "Continuar"
      : startChoice === "connect_agent"
        ? isSubmitting
          ? "Conectando..."
          : "Conectar vault"
        : startChoice === "agent_project"
          ? "Ir para onboarding"
          : "Abrir o vault";

  const primaryDisabled =
    step === 1
      ? !canContinueStep1
      : step === 2
        ? !canContinueStep2
        : !canFinishStep3 || isSubmitting;

  const stepTitle =
    step === 1
      ? "Como deseja começar?"
      : step === 2
        ? "Nome"
        : startChoice === "empty_vault"
          ? "Tudo pronto!"
          : "Como o OpenSync deve acessar seu agente?";

  const stepDescription =
    step === 1
      ? "Selecione o caminho que melhor descreve o que voce quer fazer agora."
      : step === 2
        ? "Escolha um nome para identificar este vault no dashboard."
        : startChoice === "connect_agent"
          ? "Escolha uma forma de acesso. Os dados conectam ao seu ambiente; em producao, prefira segredos no servidor."
          : startChoice === "agent_project"
            ? "Para este fluxo voce nao precisa informar acesso agora. O onboarding guia objetivos, contexto e a conexao na ultima etapa."
            : `O vault "${vaultName.trim() || "…"}" foi preparado. Voce pode abri-lo agora no explorador; conectar um agente fica para quando quiser.`;

  const step3EmptySuccess =
    step === 3 && startChoice === "empty_vault";

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
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {step3EmptySuccess
              ? "Vault vazio — Concluido"
              : `Adicionar vault — Etapa ${step} de ${TOTAL_STEPS}`}
          </p>
          {step === 2 ? (
            <div className="mt-3 rounded-lg border border-border bg-muted/25 px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Como deseja começar?
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">{selectedStartLabel}</p>
            </div>
          ) : null}
          <h1
            className={cn(
              "text-2xl font-semibold tracking-tight",
              step === 2 ? "mt-4" : "mt-2",
              step3EmptySuccess && "text-emerald-900 dark:text-emerald-100",
            )}
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
                    className={vaultNameInputClass}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ate {VAULT_NAME_MAX} caracteres. Usado no dashboard e ao conectar o agente.
                  </p>
                </div>

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

            {step === 3 && startChoice === "connect_agent" ? (
              <AgentConnectionStep form={form} onChange={setForm} hideIntro />
            ) : null}

            {step3EmptySuccess ? (
              <div className="flex flex-col items-center rounded-xl border border-emerald-200/90 bg-emerald-50/60 py-10 text-center dark:border-emerald-900/50 dark:bg-emerald-950/25">
                <div
                  className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shadow-sm dark:bg-emerald-950/60 dark:text-emerald-400"
                  aria-hidden
                >
                  <CheckCircle2 className="size-9" strokeWidth={1.75} />
                </div>
                <p className="mt-5 max-w-sm text-sm font-medium text-foreground">
                  Vault vazio criado com sucesso
                </p>
                <p className="mt-2 max-w-xs text-xs text-muted-foreground">
                  Nenhuma conexao com agente e necessaria neste momento. Use o botao abaixo para entrar no
                  explorador.
                </p>
              </div>
            ) : null}
          </div>

          {submitError ? (
            <p className="mt-4 text-sm text-destructive">{submitError}</p>
          ) : null}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={handleBack}
            >
              {step === 1 ? "Cancelar" : "Voltar"}
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
