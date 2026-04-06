"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { apiRequest } from "@/api/rest/generic";
import { Button } from "@/components/ui/button";

type OnboardingData = {
  goals: string[];
  usageContext: string;
  frequency: string;
};

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

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<OnboardingData>({
    goals: [],
    usageContext: "",
    frequency: "",
  });

  const canContinue = useMemo(() => {
    if (step === 1) return formData.goals.length > 0;
    if (step === 2) return Boolean(formData.usageContext);
    return Boolean(formData.frequency);
  }, [formData, step]);

  async function handleFinish() {
    setIsSubmitting(true);
    await apiRequest<{ ok: boolean }>("/api/onboarding/complete", {
      method: "POST",
      body: formData,
    });
    router.replace("/dashboard");
  }

  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Onboarding OpenClaw - Etapa {step} de 3
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Vamos configurar o OpenSync para o seu objetivo
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Responda 3 perguntas rapidas para personalizar sua experiencia.
      </p>

      <div className="mt-6">
        {step === 1 ? (
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

        {step === 2 ? (
          <StepOptions
            title="Como voce pretende usar no dia a dia?"
            options={contextOptions}
            selected={formData.usageContext ? [formData.usageContext] : []}
            onSelect={(value) =>
              setFormData((prev) => ({ ...prev, usageContext: value }))
            }
          />
        ) : null}

        {step === 3 ? (
          <StepOptions
            title="Com que frequencia seus arquivos mudam?"
            options={frequencyOptions}
            selected={formData.frequency ? [formData.frequency] : []}
            onSelect={(value) => setFormData((prev) => ({ ...prev, frequency: value }))}
          />
        ) : null}
      </div>

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((prev) => Math.max(1, prev - 1))}
          disabled={step === 1 || isSubmitting}
        >
          Voltar
        </Button>

        {step < 3 ? (
          <Button
            type="button"
            onClick={() => setStep((prev) => Math.min(3, prev + 1))}
            disabled={!canContinue}
          >
            Continuar
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
