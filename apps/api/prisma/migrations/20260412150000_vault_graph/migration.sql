-- vault_graphs: grafo de wikilinks e links entre arquivos de um vault

CREATE TABLE "public"."vault_graphs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "graph_json" JSON NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vault_graphs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vault_graphs_vault_id_key" ON "public"."vault_graphs"("vault_id");

ALTER TABLE "public"."vault_graphs"
  ADD CONSTRAINT "vault_graphs_vault_id_fkey"
  FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;
