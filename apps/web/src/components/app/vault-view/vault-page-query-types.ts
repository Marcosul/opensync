import type { inferParserType } from "nuqs";

import { vaultPageSearchParams } from "@/lib/vault-page-search-params";

/** Estado tipado dos search params do cofre (`?vaultId=&file=&…`). */
export type VaultPageQueryState = inferParserType<typeof vaultPageSearchParams>;
