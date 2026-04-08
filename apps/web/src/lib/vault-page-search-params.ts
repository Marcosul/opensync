import { parseAsString, parseAsStringLiteral } from "nuqs";

/** Query params da rota `/vault` (partilha e deep links). */
export const vaultPageSearchParams = {
  /** UUID do cofre (preferir a `vault` legada). */
  vaultId: parseAsString,
  /** Legado: links antigos `?vault=` */
  vault: parseAsString,
  /** Caminho do ficheiro = `docId` (ex.: `doc1.md`, `pasta/nota.md`). */
  file: parseAsString,
  /** Pasta relativa à raiz do explorador (ex.: `docs` ou `docs/sub`). */
  folder: parseAsString,
  /** `view=graph` — vista em grafo. */
  view: parseAsStringLiteral(["graph"] as const),
} as const;

export const vaultPageQueryOptions = {
  history: "replace" as const,
  shallow: true as const,
};
