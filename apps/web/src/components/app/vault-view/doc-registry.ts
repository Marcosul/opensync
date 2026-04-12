/**
 * Registo estático dos documentos mock (marketing / OpenClaw workspace).
 * Usado para resolver conteúdo local quando o path não vem de `noteContents`.
 */
import { DOCS, type MockDoc } from "@/components/marketing/openclaw-workspace-mock";

export const DOC_BY_ID = Object.fromEntries(DOCS.map((d) => [d.id, d])) as Record<
  string,
  MockDoc
>;
