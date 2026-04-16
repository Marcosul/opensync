-- AlterTable vault_files: logical_file_id (estável por ficheiro; rename preserva)
ALTER TABLE "vault_files" ADD COLUMN IF NOT EXISTS "logical_file_id" UUID;

UPDATE "vault_files" SET "logical_file_id" = "id" WHERE "logical_file_id" IS NULL;

ALTER TABLE "vault_files" ALTER COLUMN "logical_file_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "vault_files_vault_id_logical_file_id_key" ON "vault_files"("vault_id", "logical_file_id");

-- CreateTable vault_file_uploads_pending
CREATE TABLE IF NOT EXISTS "vault_file_uploads_pending" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "base_version" INTEGER,
    "expected_content_hash" TEXT NOT NULL,
    "expected_size_bytes" INTEGER NOT NULL,
    "content" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_file_uploads_pending_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vault_file_uploads_pending_vault_id_expires_at_idx" ON "vault_file_uploads_pending"("vault_id", "expires_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vault_file_uploads_pending_vault_id_fkey'
  ) THEN
    ALTER TABLE "vault_file_uploads_pending" ADD CONSTRAINT "vault_file_uploads_pending_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
