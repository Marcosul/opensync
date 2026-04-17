import { NextResponse } from "next/server";

export type AgentChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type AgentChatContext = {
  path: string;
  content: string;
};

type AgentChatBody = {
  gatewayUrl?: unknown;
  token?: unknown;
  agentId?: unknown;
  messages?: unknown;
  context?: unknown;
};

/**
 * Normaliza a URL do gateway:
 * - wss:// → https://  |  ws:// → http://
 * - Sem path explícito → acrescenta /v1/chat/completions
 */
function normalizeGatewayUrl(raw: string): { url: string; isOpenClaw: boolean } {
  let s = raw.trim().replace(/\/+$/, "");
  const isWs = s.startsWith("wss://") || s.startsWith("ws://");
  if (s.startsWith("wss://")) s = "https://" + s.slice(6);
  else if (s.startsWith("ws://")) s = "http://" + s.slice(5);

  try {
    const parsed = new URL(s);
    const hasPath = parsed.pathname !== "/" && parsed.pathname.length > 1;
    if (!hasPath) s = s + "/v1/chat/completions";
  } catch {
    s = s + "/v1/chat/completions";
  }

  return { url: s, isOpenClaw: isWs };
}

/**
 * Tenta ler a resposta como SSE OpenAI.
 * Se não encontrar nenhum chunk de conteúdo, faz fallback para JSON (non-streaming).
 * Retorna o texto da resposta pronto para stremar de volta ao cliente como SSE.
 */
async function fetchGatewayResponse(
  url: string,
  headers: Record<string, string>,
  bodyObj: Record<string, unknown>,
  isOpenClaw: boolean,
): Promise<Response> {
  // OpenClaw's streaming returns empty deltas — use non-streaming directly
  const stream = !isOpenClaw;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...bodyObj, stream }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Gateway retornou ${res.status}: ${errorText}` },
      { status: res.status },
    );
  }

  if (!isOpenClaw) {
    // Proxy stream direto ao cliente
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Non-streaming JSON → reformatar como SSE para o cliente
  const json = (await res.json()) as Record<string, unknown>;
  const choices = json.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content =
    typeof message?.content === "string"
      ? message.content
      : typeof (choices?.[0]?.delta as Record<string, unknown> | undefined)?.content === "string"
        ? ((choices?.[0]?.delta as Record<string, unknown>).content as string)
        : "";

  if (!content) {
    return NextResponse.json({ error: "O agente não retornou conteúdo." }, { status: 502 });
  }

  const sseBody =
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n` + `data: [DONE]\n\n`;

  return new Response(sseBody, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: Request) {
  let body: AgentChatBody;
  try {
    body = (await request.json()) as AgentChatBody;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { gatewayUrl, token, agentId, messages, context } = body;

  if (typeof gatewayUrl !== "string" || !gatewayUrl.trim()) {
    return NextResponse.json({ error: "gatewayUrl é obrigatório" }, { status: 400 });
  }
  if (typeof token !== "string" || !token.trim()) {
    return NextResponse.json({ error: "token é obrigatório" }, { status: 400 });
  }

  const { url, isOpenClaw } = normalizeGatewayUrl(gatewayUrl);
  const resolvedAgentId = typeof agentId === "string" && agentId.trim() ? agentId.trim() : "main";

  const contextEntries = Array.isArray(context) ? (context as AgentChatContext[]) : [];
  const allMessages = Array.isArray(messages) ? (messages as AgentChatMessage[]) : [];

  const fileOpsInstructions = `

File and folder operations you can perform — use these exact formats in your response:

**Edit or create a file** (full content required):
\`\`\`path/to/file.md
complete file content here
\`\`\`

**Delete files** (one path per line):
\`\`\`DELETE
path/to/file.md
\`\`\`

**Folder operations** (one operation per line):
\`\`\`FOLDER-OP
CREATE path/to/new-folder
DELETE path/to/folder
RENAME path/to/old-name → path/to/new-name
\`\`\`

Use the exact file paths from the <file path="..."> attributes. For new files, use a path within the provided folder context.`;

  const systemContent =
    contextEntries.length > 0
      ? contextEntries
          .map((c) => `<file path="${c.path}">\n${c.content}\n</file>`)
          .join("\n\n") + fileOpsInstructions
      : null;

  const forwardMessages: AgentChatMessage[] = systemContent
    ? [{ role: "system", content: systemContent }, ...allMessages]
    : allMessages;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  if (isOpenClaw) {
    headers["x-openclaw-agent-id"] = resolvedAgentId;
    headers["x-openclaw-scopes"] = "operator.write";
  }

  const bodyObj: Record<string, unknown> = {
    ...(isOpenClaw ? { model: `openclaw:${resolvedAgentId}` } : {}),
    messages: forwardMessages,
  };

  try {
    return await fetchGatewayResponse(url, headers, bodyObj, isOpenClaw);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao conectar ao gateway";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
