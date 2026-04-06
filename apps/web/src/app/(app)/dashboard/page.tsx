import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server-client";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const cookieStore = await cookies();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const goals = cookieStore.get("opensync_goals")?.value;
  const usageContext = cookieStore.get("opensync_usage_context")?.value;
  const frequency = cookieStore.get("opensync_usage_frequency")?.value;

  return (
    <section className="grid gap-4 pb-6 sm:grid-cols-2 xl:grid-cols-3">
      <article className="rounded-2xl border bg-card p-5 shadow-sm sm:col-span-2 xl:col-span-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sessao ativa para {user?.email ?? "usuario"}.
        </p>
      </article>

      <DashboardCard
        title="Objetivos escolhidos"
        value={goals ?? "Definir objetivo no onboarding"}
      />
      <DashboardCard
        title="Contexto de uso"
        value={usageContext ?? "Nao informado"}
      />
      <DashboardCard
        title="Frequencia esperada"
        value={frequency ?? "Nao informado"}
      />
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
