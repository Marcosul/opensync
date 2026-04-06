import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("onboarding_goals, onboarding_usage_context, onboarding_frequency, agent_connection")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const meta = user?.user_metadata ?? {};

  const goalsFromProfile =
    profile?.onboarding_goals?.length && profile.onboarding_goals.length > 0
      ? profile.onboarding_goals.join(" · ")
      : null;
  const goalsFromMeta = Array.isArray(meta.opensync_onboarding_goals)
    ? (meta.opensync_onboarding_goals as string[]).join(" · ")
    : null;
  const goals = goalsFromProfile ?? goalsFromMeta ?? "Definir objetivo no onboarding";

  const usageContext =
    profile?.onboarding_usage_context ??
    (typeof meta.opensync_onboarding_usage_context === "string"
      ? meta.opensync_onboarding_usage_context
      : null) ??
    "Nao informado";

  const frequency =
    profile?.onboarding_frequency ??
    (typeof meta.opensync_onboarding_frequency === "string"
      ? meta.opensync_onboarding_frequency
      : null) ??
    "Nao informado";

  const agentRaw = profile?.agent_connection ?? meta.opensync_agent_connection;
  const agentPreview = formatAgentConnectionPreview(agentRaw);

  const storageHint =
    goalsFromProfile || profile?.onboarding_completed_at
      ? null
      : goalsFromMeta
        ? "Dados salvos no perfil de autenticacao. Execute o SQL de public.profiles no Supabase para migrar para o banco."
        : null;

  return (
    <section className="grid gap-4 pb-6 sm:grid-cols-2 xl:grid-cols-3">
      <article className="rounded-2xl border bg-card p-5 shadow-sm sm:col-span-2 xl:col-span-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sessao ativa para {user?.email ?? "usuario"}.
        </p>
        {storageHint ? (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{storageHint}</p>
        ) : null}
      </article>

      <DashboardCard title="Objetivos escolhidos" value={goals} />
      <DashboardCard title="Contexto de uso" value={usageContext} />
      <DashboardCard title="Frequencia esperada" value={frequency} />
      <DashboardCard
        title="Conexao com o agente"
        value={agentPreview}
        className="sm:col-span-2 xl:col-span-3"
      />
    </section>
  );
}

function formatAgentConnectionPreview(raw: unknown): string {
  if (raw == null || typeof raw !== "object") {
    return "Nao informado";
  }
  const o = raw as Record<string, unknown>;
  const mode = o.mode;
  if (mode === "gateway") {
    const url = typeof o.gatewayUrl === "string" ? o.gatewayUrl : "";
    return url ? `Gateway: ${url}` : "Gateway configurado";
  }
  if (mode === "ssh_key") {
    const host = typeof o.host === "string" ? o.host : "";
    const port = typeof o.port === "number" ? o.port : 22;
    return host ? `SSH (chave): ${host}:${port}` : "SSH (chave) configurado";
  }
  if (mode === "ssh_password") {
    const host = typeof o.host === "string" ? o.host : "";
    const port = typeof o.port === "number" ? o.port : 22;
    return host ? `SSH (usuario e senha): ${host}:${port}` : "SSH (senha) configurado";
  }
  return "Configurado";
}

function DashboardCard({
  title,
  value,
  className,
}: {
  title: string;
  value: string;
  className?: string;
}) {
  return (
    <article className={cn("rounded-2xl border bg-card p-5 shadow-sm", className)}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </article>
  );
}
