/**
 * Estrutura alinhada ao mapa oficial do workspace OpenClaw:
 * @see https://docs.openclaw.ai/concepts/agent-workspace#workspace-file-map-what-each-file-means
 * Template AGENTS.md e convenções de sessão:
 * @see https://docs.openclaw.ai/reference/templates/
 *
 * Raiz `~/.openclaw` (config/estado) + `workspace/` (home do agente) conforme docs.
 */

export type MockDoc = {
  id: string;
  body: string;
  wikilinks: string[];
};

export type TreeEntry =
  | { type: "file"; name: string; docId: string }
  | { type: "file"; name: string; disabled: true }
  | {
      type: "dir";
      name: string;
      path: string;
      children: TreeEntry[];
    };

/** Breadcrumb do explorer: raiz do mock (equivalente a `~/.openclaw/`). */
export const OPENCLAW_ROOT_LABEL = "~/.openclaw/";

/** Árvore única com raiz explícita (equivalente a listar `~/.openclaw`). */
export const OPENCLAW_TREE_ROOT: TreeEntry = {
  type: "dir",
  name: "~/.openclaw",
  path: "openclaw-root",
  children: [
    { type: "file", name: "openclaw.json", docId: "openclaw.json" },
    { type: "file", name: "update-check.json", disabled: true },
    {
      type: "dir",
      name: "tasks",
      path: "openclaw/tasks",
      children: [],
    },
    {
      type: "dir",
      name: "telegram",
      path: "openclaw/telegram",
      children: [],
    },
    {
      type: "dir",
      name: "agents",
      path: "openclaw/agents",
      children: [],
    },
    {
      type: "dir",
      name: "workspace",
      path: "openclaw/workspace",
      children: [
        { type: "file", name: "AGENTS.md", docId: "AGENTS.md" },
        { type: "file", name: "SOUL.md", docId: "SOUL.md" },
        { type: "file", name: "USER.md", docId: "USER.md" },
        { type: "file", name: "IDENTITY.md", docId: "IDENTITY.md" },
        { type: "file", name: "TOOLS.md", docId: "TOOLS.md" },
        { type: "file", name: "HEARTBEAT.md", docId: "HEARTBEAT.md" },
        { type: "file", name: "BOOT.md", docId: "BOOT.md" },
        { type: "file", name: "BOOTSTRAP.md", docId: "BOOTSTRAP.md" },
        { type: "file", name: "MEMORY.md", docId: "MEMORY.md" },
        {
          type: "dir",
          name: "memory",
          path: "openclaw/workspace/memory",
          children: [
            {
              type: "file",
              name: "2026-04-06.md",
              docId: "memory/2026-04-06.md",
            },
          ],
        },
        {
          type: "dir",
          name: "skills",
          path: "openclaw/workspace/skills",
          children: [],
        },
        {
          type: "dir",
          name: "canvas",
          path: "openclaw/workspace/canvas",
          children: [],
        },
      ],
    },
  ],
};

export const DOCS: MockDoc[] = [
  {
    id: "openclaw.json",
    body:
      "Global OpenClaw config (fora do workspace): default agent, model/provider, workspace path, sandbox e defaults.",
    wikilinks: ["AGENTS.md", "TOOLS.md", "HEARTBEAT.md"],
  },
  {
    id: "AGENTS.md",
    body:
      "Operating instructions: session startup reads SOUL, USER, memory; MAIN session also loads MEMORY.md. Red lines: no exfiltration, trash > rm.",
    wikilinks: ["SOUL.md", "USER.md", "MEMORY.md", "TOOLS.md", "HEARTBEAT.md", "BOOTSTRAP.md"],
  },
  {
    id: "SOUL.md",
    body: "Persona, tone, and boundaries — who you are in the workspace.",
    wikilinks: ["AGENTS.md", "IDENTITY.md", "USER.md"],
  },
  {
    id: "USER.md",
    body: "Who the user is and how to address them — loaded every session.",
    wikilinks: ["AGENTS.md", "SOUL.md"],
  },
  {
    id: "IDENTITY.md",
    body: "Name, vibe, emoji — created or updated during bootstrap.",
    wikilinks: ["SOUL.md", "AGENTS.md"],
  },
  {
    id: "TOOLS.md",
    body: "Local tools and conventions — guidance only; does not enable tools.",
    wikilinks: ["AGENTS.md", "HEARTBEAT.md"],
  },
  {
    id: "HEARTBEAT.md",
    body:
      "Short checklist for heartbeat polls — keep tiny to limit token burn. Reply HEARTBEAT_OK when nothing needs attention.",
    wikilinks: ["AGENTS.md", "memory/2026-04-06.md"],
  },
  {
    id: "BOOT.md",
    body: "Optional startup checklist on gateway restart when internal hooks are enabled.",
    wikilinks: ["AGENTS.md", "BOOTSTRAP.md"],
  },
  {
    id: "BOOTSTRAP.md",
    body:
      "One-time first-run ritual — follow it, then delete this file when done (birth certificate).",
    wikilinks: ["AGENTS.md", "IDENTITY.md"],
  },
  {
    id: "MEMORY.md",
    body:
      "Curated long-term memory — ONLY in main / private session; do not load in shared or group contexts.",
    wikilinks: ["AGENTS.md", "memory/2026-04-06.md", "USER.md"],
  },
  {
    id: "memory/2026-04-06.md",
    body: "Daily memory log — raw notes for this day; roll insights into MEMORY.md over time.",
    wikilinks: ["AGENTS.md", "MEMORY.md"],
  },
];
