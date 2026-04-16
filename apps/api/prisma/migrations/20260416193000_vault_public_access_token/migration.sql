-- Partilha pública read-only (URL com token opaco).
ALTER TABLE "vaults" ADD COLUMN "public_access_token" TEXT;

CREATE UNIQUE INDEX "vaults_public_access_token_key" ON "vaults"("public_access_token");

NOTIFY pgrst, 'reload schema';
