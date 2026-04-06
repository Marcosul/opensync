import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("onboarding_goals, onboarding_usage_context, onboarding_frequency")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  const goals =
    profile?.onboarding_goals?.length && profile.onboarding_goals.length > 0
      ? profile.onboarding_goals.join(" · ")
      : "Definir objetivo no onboarding";
  const usageContext = profile?.onboarding_usage_context ?? "Nao informado";
  const frequency = profile?.onboarding_frequency ?? "Nao informado";

  return (
    <section className="grid gap-4 pb-6 sm:grid-cols-2 xl:grid-cols-3">
      <article className="rounded-2xl border bg-card p-5 shadow-sm sm:col-span-2 xl:col-span-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sessao ativa para {user?.email ?? "usuario"}.
        </p>
      </article>

      <DashboardCard title="Objetivos escolhidos" value={goals} />
      <DashboardCard title="Contexto de uso" value={usageContext} />
      <DashboardCard title="Frequencia esperada" value={frequency} />
    </section>
  );
}

function DashboardCard({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-2 text-sm font-medium">{value}</p>
    </article>
  );
}
