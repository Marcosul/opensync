"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { apiRequest } from "@/api/rest/generic";
import { Button } from "@/components/ui/button";

type OnboardingData = {
  goals: string[];
  usageContext: string;
  frequency: string;
};

const TOTAL_STEPS = 4;

const goalOptions = [
  "Acessar os arquivos do meu agente openclaw pela web",
  "Desfazer alteracoes que deram errado com 1 clique",
  "Acompanhar o que meu agente mudou ao longo do tempo",
];

const contextOptions = [
  "Uso sozinho, no meu dia a dia",
  "Uso com mais pessoas no mesmo projeto",
  "Uso para clientes ou projetos diferentes",
];
const frequencyOptions = ["Todo dia", "Algumas vezes por semana", "De vez em quando"];

const workspaceInputClass =
  "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formData, setFormData] = useState<OnboardingData>({
    goals: [],
    usageContext: "",
    frequency: "",
  });

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const requestWorkspaceBootstrap = useCallback(async () => {
    const res = await apiRequest<{ workspace: { id: string; name: string } }>(
      "/api/onboarding/bootstrap",
      { method: "POST" },
    );
    return res.workspace;
  }, []);

  const loadWorkspaceBootstrap = useCallback(async () => {
    setBootstrapLoading(true);
    setBootstrapError(null);
    try {
      const ws = await requestWorkspaceBootstrap();
      setWorkspaceId(ws.id);
      setWorkspaceName((prev) => (prev.trim() ? prev : ws.name));
    } catch (error) {
      let message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel preparar seu workspace.";
      try {
        const parsed = JSON.parse(message) as { error?: string };
        if (parsed.error) {
          message = parsed.error;
        }
      } catch {
        // keep raw message
      }
      setBootstrapError(message);
      setWorkspaceId(null);
    } finally {
      setBootstrapLoading(false);
    }
  }, [requestWorkspaceBootstrap]);

  useEffect(() => {
    void loadWorkspaceBootstrap();
  }, [loadWorkspaceBootstrap]);

  const canContinue = useMemo(() => {
    if (step === 1) {
      return workspaceName.trim().length > 0;
    }
    if (step === 2) return formData.goals.length > 0;
    if (step === 3) return Boolean(formData.usageContext);
    if (step === 4) return Boolean(formData.frequency);
    return false;
  }, [formData, step, workspaceName]);

  async function handleFinish() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await apiRequest<{ ok: boolean }>("/api/onboarding/complete", {
        method: "POST",
        body: {
          goals: formData.goals,
          usageContext: formData.usageContext,
          frequency: formData.frequency,
        },
      });
      router.replace("/dashboard");
    } catch (error) {
      let message =
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar o onboarding.";
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

  async function goNext() {
    if (step < TOTAL_STEPS) {
      if (step === 1) {
        const name = workspaceName.trim();
        if (!name) return;
        setIsSubmitting(true);
        setSubmitError(null);
        try {
          let id = workspaceId;
          if (!id) {
            const ws = await requestWorkspaceBootstrap();
            id = ws.id;
            setWorkspaceId(ws.id);
            setWorkspaceName((prev) => (prev.trim() ? prev : ws.name));
            setBootstrapError(null);
          }
          await apiRequest<{ workspace: { id: string; name: string } }>(
            `/api/workspaces/${encodeURIComponent(id)}`,
            {
              method: "PATCH",
              body: { name },
            },
          );
          setStep(2);
        } catch (error) {
          let message =
            error instanceof Error
              ? error.message
              : "Nao foi possivel salvar o nome do workspace.";
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
        return;
      }
      setStep((prev) => Math.min(TOTAL_STEPS, prev + 1));
    }
  }

  const pageTitle =
    step === 1
      ? "Como devemos chamar seu workspace?"
      : "Vamos configurar o OpenSync para o seu objetivo";

  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Onboarding OpenClaw - Etapa {step} de {TOTAL_STEPS}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{pageTitle}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {step === 1
          ? "Escolha um nome que identifique seu projeto ou equipa. Voce pode alterar depois."
          : `Responda ${TOTAL_STEPS} etapas rapidas para personalizar sua experiencia.`}
      </p>

      <div className="mt-6">
        {step === 1 ? (
          <div className="space-y-3">
            {bootstrapLoading ? (
              <p className="text-sm text-muted-foreground">
                A sincronizar com o servidor... Voce ja pode escrever o nome abaixo.
              </p>
            ) : null}
            {bootstrapError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="text-destructive">{bootstrapError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void loadWorkspaceBootstrap()}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : null}
            <div>
              <label htmlFor="workspace-name" className="block text-sm font-medium text-foreground">
                Nome do workspace
              </label>
              <input
                id="workspace-name"
                type="text"
                autoComplete="organization"
                placeholder="Ex.: marco's Workspace"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                disabled={isSubmitting}
                className={workspaceInputClass}
                maxLength={120}
              />
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <StepOptions
            title="Qual resultado voce quer com o OpenSync?"
            options={goalOptions}
            selected={formData.goals}
            allowMultiple
            onSelect={(value) =>
              setFormData((prev) => {
                const hasValue = prev.goals.includes(value);
                return {
                  ...prev,
                  goals: hasValue
                    ? prev.goals.filter((item) => item !== value)
                    : [...prev.goals, value],
                };
              })
            }
          />
        ) : null}

        {step === 3 ? (
          <StepOptions
            title="Como voce pretende usar no dia a dia?"
            options={contextOptions}
            selected={formData.usageContext ? [formData.usageContext] : []}
            onSelect={(value) =>
              setFormData((prev) => ({ ...prev, usageContext: value }))
            }
          />
        ) : null}

        {step === 4 ? (
          <StepOptions
            title="Com que frequencia seus arquivos mudam?"
            options={frequencyOptions}
            selected={formData.frequency ? [formData.frequency] : []}
            onSelect={(value) => setFormData((prev) => ({ ...prev, frequency: value }))}
          />
        ) : null}
      </div>

      {submitError ? (
        <p className="mt-4 text-sm text-destructive">{submitError}</p>
      ) : null}

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((prev) => Math.max(1, prev - 1))}
          disabled={step === 1 || isSubmitting}
        >
          Voltar
        </Button>

        {step < TOTAL_STEPS ? (
          <Button
            type="button"
            onClick={() => void goNext()}
            disabled={!canContinue || isSubmitting}
          >
            {step === 1 && isSubmitting ? "Salvando..." : "Continuar"}
          </Button>
        ) : (
          <Button type="button" onClick={handleFinish} disabled={!canContinue || isSubmitting}>
            {isSubmitting ? "Finalizando..." : "Finalizar onboarding"}
          </Button>
        )}
      </div>
    </section>
  );
}

type StepOptionsProps = {
  title: string;
  options: string[];
  selected: string[];
  allowMultiple?: boolean;
  onSelect: (value: string) => void;
};

function StepOptions({
  title,
  options,
  selected,
  allowMultiple = false,
  onSelect,
}: StepOptionsProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-medium">{title}</h2>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onSelect(option)}
          className={[
            "flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm transition-colors",
            selected.includes(option)
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border bg-background hover:bg-muted/50",
          ].join(" ")}
        >
          <span>{option}</span>
          <span
            aria-hidden="true"
            className={[
              "ml-3 inline-flex h-5 w-5 items-center justify-center rounded border text-xs",
              selected.includes(option)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-transparent",
            ].join(" ")}
          >
            ✓
          </span>
        </button>
      ))}
      {allowMultiple ? (
        <p className="text-xs text-muted-foreground">
          Voce pode escolher mais de uma opcao.
        </p>
      ) : null}
    </div>
  );
}
