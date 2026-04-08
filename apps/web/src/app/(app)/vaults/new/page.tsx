"use client";

import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiRequest } from "@/api/rest/generic";
import {
  readVaultMetas,
  saveSnapshot,
  writeActiveVaultId,
  writePendingActiveVaultId,
  writePendingAgentProject,
  writeVaultMetas,
} from "@/components/app/vault-persistence";
import { AgentConnectionStep } from "@/components/onboarding/agent-connection-step";
import { OpenSyncAgentSkillInstructions } from "@/components/onboarding/opensync-agent-skill-instructions";
import { Button } from "@/components/ui/button";
import {
  buildAgentConnectionPayload,
  getAgentConnectionValidationMessage,
  isAgentConnectionValid,
  type AgentConnectionForm,
} from "@/lib/onboarding-agent";
import { remoteTextFilesToVaultSnapshot } from "@/lib/vault-remote-import";
import type { VaultListItem } from "@/lib/vault-list-types";
import { cn } from "@/lib/utils";

const defaultAgentFields: AgentConnectionForm = {
  agentMode: "ssh_key",
  sshHost: "",
  sshPort: "22",
  sshUser: "",
  sshPrivateKey: "",
  sshPassword: "",
  sshRemotePath: "",
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
    hint: "Importacao SSH inicial + skill OpenSync (sync programático). Alternativa: vault vazio + Git no dashboard.",
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
  const [connectLog, setConnectLog] = useState<string[]>([]);
  const [connectElapsedSec, setConnectElapsedSec] = useState(0);

  useEffect(() => {
    if (startChoice !== "agent_project") {
      setAgentProjectScope("single_agent");
      setSquadMission("");
    }
  }, [startChoice]);

  useEffect(() => {
    if (!isSubmitting) {
      setConnectElapsedSec(0);
      return;
    }
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setConnectElapsedSec(Math.floor((Date.now() - t0) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [isSubmitting]);

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

  async function handleConnectAgent() {
    setSubmitError(null);
    setConnectLog([]);
    setIsSubmitting(true);
    try {
      const formatMsg = getAgentConnectionValidationMessage(form);
      if (formatMsg) {
        setSubmitError(formatMsg);
        return;
      }
      const agentConnection = buildAgentConnectionPayload(form);
      if (!agentConnection) {
        setSubmitError("Preencha os dados de conexao do agente.");
        return;
      }

      const streamRes = await fetch("/api/vaults/connect?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentConnection, vaultName: vaultName.trim() }),
        cache: "no-store",
      });

      const ct = streamRes.headers.get("content-type") || "";

      if (!streamRes.ok || !ct.includes("ndjson")) {
        const text = await streamRes.text();
        setSubmitError(formatSubmitError(text));
        return;
      }

      const reader = streamRes.body?.getReader();
      if (!reader) {
        setSubmitError("Resposta sem corpo (stream).");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let doneBody: {
        snapshotVaultId: string;
        initialFiles: Record<string, string>;
      } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let row: {
            t: string;
            m?: string;
            body?: {
              snapshotVaultId?: string;
              initialFiles?: Record<string, string>;
            };
            error?: string;
          };
          try {
            row = JSON.parse(line) as typeof row;
          } catch {
            continue;
          }
          if (row.t === "log" && row.m) {
            setConnectLog((prev) => [...prev, row.m as string]);
          } else if (row.t === "error") {
            throw new Error(row.error || "Falha na conexao.");
          } else if (row.t === "done" && row.body?.snapshotVaultId) {
            doneBody = {
              snapshotVaultId: row.body.snapshotVaultId,
              initialFiles: row.body.initialFiles ?? {},
            };
          }
        }
        if (done) break;
      }

      if (!doneBody?.snapshotVaultId?.trim()) {
        throw new Error("Resposta incompleta do servidor.");
      }

      const vaultId = doneBody.snapshotVaultId.trim();
      const snap = remoteTextFilesToVaultSnapshot(doneBody.initialFiles ?? {});
      saveSnapshot(vaultId, snap);

      /** Garantir que o novo cofre entra em metas antes de redirecionar — readActiveVaultId só ativa IDs presentes na lista. */
      const label = vaultName.trim() || "Vault";
      const metas = readVaultMetas();
      if (!metas.some((m) => m.id === vaultId)) {
        metas.push({
          id: vaultId,
          name: label,
          pathLabel: "SSH / VPS",
          kind: "blank",
          managedByProfile: true,
          deletable: false,
          remoteSync: "ssh",
        });
        writeVaultMetas(metas);
      }
      writeActiveVaultId(vaultId);
      writePendingActiveVaultId(vaultId);
      router.replace("/vault");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel conectar o vault.";
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
      writePendingActiveVaultId(vault.id);
      router.push("/vault");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel salvar o vault.";
      setSubmitError(formatSubmitError(message));
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
          ? `Conectando… ${connectElapsedSec}s`
          : "Conectar vault"
        : startChoice === "agent_project"
          ? "Ir para onboarding"
          : isSubmitting
            ? "Criando..."
            : "Criar e abrir o vault";

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
          ? "Confirmar criacao"
          : "Como o OpenSync deve acessar seu agente?";

  const stepDescription =
    step === 1
      ? "Selecione o caminho que melhor descreve o que voce quer fazer agora."
      : step === 2
        ? "Escolha um nome para identificar este vault no dashboard."
        : startChoice === "connect_agent"
          ? "Siga primeiro o bloco da skill OpenSync (instalação no OpenClaw e sync via Git/script). A importação SSH abaixo traz um snapshot inicial do ~/.openclaw para o explorador."
          : startChoice === "agent_project"
            ? "Para este fluxo voce nao precisa informar acesso agora. O onboarding guia objetivos, contexto e a conexao na ultima etapa."
            : `O vault "${vaultName.trim() || "…"}" sera criado no servidor (banco de dados + repositorio no Gitea) quando voce confirmar. Depois voce entra no explorador; conectar um agente pode ser feito depois.`;

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
              ? "Vault vazio — Confirmar"
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
              <>
                <OpenSyncAgentSkillInstructions />
                <AgentConnectionStep form={form} onChange={setForm} hideIntro />
              </>
            ) : null}

            {step === 3 && startChoice === "connect_agent" && (isSubmitting || connectLog.length > 0) ? (
              <div className="mt-5 rounded-xl border border-border bg-muted/35 p-3 sm:p-4">
                <p className="text-xs font-medium text-muted-foreground">Progresso da ligacao SSH</p>
                <pre
                  className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground sm:max-h-64 sm:text-xs"
                  aria-live="polite"
                >
                  {connectLog.length > 0 ? connectLog.join("\n") : "A iniciar…"}
                </pre>
                {isSubmitting ? (
                  <p className="mt-2 text-[11px] text-muted-foreground sm:text-xs">
                    Importar <span className="font-mono">~/.openclaw</span> pode demorar com muitas
                    pastas. Os mesmos passos aparecem no terminal do{" "}
                    <span className="font-mono">next dev</span>.
                  </p>
                ) : null}
              </div>
            ) : null}

            {step3EmptySuccess ? (
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
