import { NextResponse } from "next/server";

import { readOpensyncSkillMarkdown } from "@/lib/server/opensync-skill-markdown";

/** Ficheiro SKILL.md da OpenSync para o agente obter por URL (fetch ou download). */
export async function GET() {
  const body = readOpensyncSkillMarkdown();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'inline; filename="SKILL.md"',
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
