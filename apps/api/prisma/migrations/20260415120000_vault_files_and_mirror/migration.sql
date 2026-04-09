-- vault_files, vault_file_changes, vault_gitea_mirror_state (fonte de verdade sync por ficheiro)

CREATE TABLE "public"."vault_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "content_hash" TEXT,
    "size_bytes" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "vault_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vault_files_vault_id_path_key" ON "public"."vault_files"("vault_id", "path");

CREATE INDEX "vault_files_vault_id_idx" ON "public"."vault_files"("vault_id");

ALTER TABLE "public"."vault_files"
  ADD CONSTRAINT "vault_files_vault_id_fkey"
  FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."vault_file_changes" (
    "id" BIGSERIAL NOT NULL,
    "vault_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "change_type" TEXT NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vault_file_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vault_file_changes_vault_id_id_idx" ON "public"."vault_file_changes"("vault_id", "id");

ALTER TABLE "public"."vault_file_changes"
  ADD CONSTRAINT "vault_file_changes_vault_id_fkey"
  FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."vault_gitea_mirror_state" (
    "vault_id" UUID NOT NULL,
    "last_mirrored_change_id" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "vault_gitea_mirror_state_pkey" PRIMARY KEY ("vault_id")
);

ALTER TABLE "public"."vault_gitea_mirror_state"
  ADD CONSTRAINT "vault_gitea_mirror_state_vault_id_fkey"
  FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;
