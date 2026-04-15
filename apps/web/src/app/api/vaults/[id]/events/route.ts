import { createSupabaseServerClient } from "@/lib/supabase/server-client";

function resolveBackendBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? process.env.OPENSYNC_API_URL ?? "").trim();
  if (!raw) return "";
  const clean = raw.replace(/\/+$/, "");
  return clean.endsWith("/api") ? clean.slice(0, -4) : clean;
}

/**
 * Proxy SSE: autentica via Supabase session e faz proxy do stream SSE do NestJS.
 * O browser não pode chamar o NestJS diretamente pois a autenticação é via sessão Supabase,
 * não via bearer token. Este handler converte a sessão em headers x-opensync-user-id.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Nao autenticado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const base = resolveBackendBaseUrl();
  if (!base) {
    return new Response(JSON.stringify({ error: "API URL nao configurada" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstreamUrl = `${base}/api/vaults/${encodeURIComponent(id)}/events`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: {
        "x-opensync-user-id": user.id,
        "x-opensync-user-email": user.email ?? "",
      },
      // Necessário para Next.js não bufferizar a resposta SSE
      cache: "no-store",
    });
  } catch {
    return new Response(JSON.stringify({ error: "Falha ao conectar ao backend SSE" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream.status });
  }

  // Encaminha o stream diretamente para o browser
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
