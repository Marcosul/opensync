-- Migração inicial única: alinhada a `apps/api/prisma/**/*.prisma` (Prisma 6, pasta `schema`).
--
-- DDL gerado a partir do schema:
--   cd apps/api && pnpm exec prisma migrate diff --from-empty --to-schema-datamodel prisma --script
-- O `migrate diff` não inclui ordem correcta de FKs, `auth.users`, RLS, trigger nem NOTIFY;
-- esse SQL foi ordenado e completado manualmente para Supabase.
--
-- Tabelas: profiles, workspaces, vaults, agents, commits, file_links, audit_log.

CREATE SCHEMA IF NOT EXISTS "public";

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tabelas (ordem de FKs)
-- ---------------------------------------------------------------------------

CREATE TABLE "public"."profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "stripe_customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onboarding_goals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onboarding_usage_context" TEXT,
    "onboarding_frequency" TEXT,
    "onboarding_completed_at" TIMESTAMP(3),
    "agent_connection" JSONB,
    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey"
  FOREIGN KEY ("id") REFERENCES auth.users (id) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspaces_user_id_name_key" ON "public"."workspaces"("user_id", "name");

CREATE INDEX "workspaces_user_id_idx" ON "public"."workspaces"("user_id");

ALTER TABLE "public"."workspaces"
  ADD CONSTRAINT "workspaces_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."vaults" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "gitea_repo" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT './openclaw',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "agent_deploy_key_gitea_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vaults_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vaults_workspace_id_name_key" ON "public"."vaults"("workspace_id", "name");

CREATE INDEX "vaults_workspace_id_idx" ON "public"."vaults"("workspace_id");

ALTER TABLE "public"."vaults"
  ADD CONSTRAINT "vaults_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."agents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "last_sync" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agents_vault_id_idx" ON "public"."agents"("vault_id");

ALTER TABLE "public"."agents"
  ADD CONSTRAINT "agents_vault_id_fkey"
  FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."commits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "agent_id" UUID,
    "hash" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "files_changed" INTEGER NOT NULL DEFAULT 0,
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commits_vault_id_idx" ON "public"."commits"("vault_id");
CREATE INDEX "commits_agent_id_idx" ON "public"."commits"("agent_id");

ALTER TABLE "public"."commits"
  ADD CONSTRAINT "commits_vault_id_fkey"
  FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."commits"
  ADD CONSTRAINT "commits_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "public"."file_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "source_file" TEXT NOT NULL,
    "target_file" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "file_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "file_links_vault_id_source_file_target_file_key" ON "public"."file_links"("vault_id", "source_file", "target_file");

CREATE INDEX "file_links_vault_id_idx" ON "public"."file_links"("vault_id");

ALTER TABLE "public"."file_links"
  ADD CONSTRAINT "file_links_vault_id_fkey"
  FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "vault_id" UUID,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_user_id_idx" ON "public"."audit_log"("user_id");
CREATE INDEX "audit_log_vault_id_idx" ON "public"."audit_log"("vault_id");

ALTER TABLE "public"."audit_log"
  ADD CONSTRAINT "audit_log_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."audit_log"
  ADD CONSTRAINT "audit_log_vault_id_fkey"
  FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- RLS (Supabase Data API)
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON "public"."profiles";
CREATE POLICY "Users can read own profile"
  ON "public"."profiles" FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON "public"."profiles";
CREATE POLICY "Users can insert own profile"
  ON "public"."profiles" FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON "public"."profiles";
CREATE POLICY "Users can update own profile"
  ON "public"."profiles" FOR UPDATE
  USING (auth.uid() = id);

ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own workspaces" ON "public"."workspaces";
CREATE POLICY "Users can read own workspaces"
  ON "public"."workspaces" FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own workspaces" ON "public"."workspaces";
CREATE POLICY "Users can insert own workspaces"
  ON "public"."workspaces" FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own workspaces" ON "public"."workspaces";
CREATE POLICY "Users can update own workspaces"
  ON "public"."workspaces" FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own workspaces" ON "public"."workspaces";
CREATE POLICY "Users can delete own workspaces"
  ON "public"."workspaces" FOR DELETE
  USING (auth.uid() = user_id);

ALTER TABLE "public"."vaults" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own vaults" ON "public"."vaults";
CREATE POLICY "Users can read own vaults"
  ON "public"."vaults" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "public"."workspaces" w
      WHERE w.id = vaults.workspace_id AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own vaults" ON "public"."vaults";
CREATE POLICY "Users can insert own vaults"
  ON "public"."vaults" FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."workspaces" w
      WHERE w.id = vaults.workspace_id AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own vaults" ON "public"."vaults";
CREATE POLICY "Users can update own vaults"
  ON "public"."vaults" FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "public"."workspaces" w
      WHERE w.id = vaults.workspace_id AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."workspaces" w
      WHERE w.id = vaults.workspace_id AND w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own vaults" ON "public"."vaults";
CREATE POLICY "Users can delete own vaults"
  ON "public"."vaults" FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "public"."workspaces" w
      WHERE w.id = vaults.workspace_id AND w.user_id = auth.uid()
    )
  );

ALTER TABLE "public"."agents" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users crud agents in own vaults" ON "public"."agents";
CREATE POLICY "Users crud agents in own vaults"
  ON "public"."agents" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "public"."vaults" v
      JOIN "public"."workspaces" w ON w.id = v.workspace_id
      WHERE v.id = agents.vault_id AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."vaults" v
      JOIN "public"."workspaces" w ON w.id = v.workspace_id
      WHERE v.id = agents.vault_id AND w.user_id = auth.uid()
    )
  );

ALTER TABLE "public"."commits" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users crud commits in own vaults" ON "public"."commits";
CREATE POLICY "Users crud commits in own vaults"
  ON "public"."commits" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "public"."vaults" v
      JOIN "public"."workspaces" w ON w.id = v.workspace_id
      WHERE v.id = commits.vault_id AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."vaults" v
      JOIN "public"."workspaces" w ON w.id = v.workspace_id
      WHERE v.id = commits.vault_id AND w.user_id = auth.uid()
    )
  );

ALTER TABLE "public"."file_links" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users crud file_links in own vaults" ON "public"."file_links";
CREATE POLICY "Users crud file_links in own vaults"
  ON "public"."file_links" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "public"."vaults" v
      JOIN "public"."workspaces" w ON w.id = v.workspace_id
      WHERE v.id = file_links.vault_id AND w.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."vaults" v
      JOIN "public"."workspaces" w ON w.id = v.workspace_id
      WHERE v.id = file_links.vault_id AND w.user_id = auth.uid()
    )
  );

ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read audit_log own rows" ON "public"."audit_log";
CREATE POLICY "Users read audit_log own rows"
  ON "public"."audit_log" FOR SELECT
  USING (
    (audit_log.user_id IS NOT NULL AND audit_log.user_id = auth.uid())
    OR (
      audit_log.vault_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "public"."vaults" v
        JOIN "public"."workspaces" w ON w.id = v.workspace_id
        WHERE v.id = audit_log.vault_id AND w.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users insert audit_log own rows" ON "public"."audit_log";
CREATE POLICY "Users insert audit_log own rows"
  ON "public"."audit_log" FOR INSERT
  WITH CHECK (
    (audit_log.user_id IS NOT NULL AND audit_log.user_id = auth.uid())
    OR (
      audit_log.vault_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "public"."vaults" v
        JOIN "public"."workspaces" w ON w.id = v.workspace_id
        WHERE v.id = audit_log.vault_id AND w.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users update audit_log own rows" ON "public"."audit_log";
CREATE POLICY "Users update audit_log own rows"
  ON "public"."audit_log" FOR UPDATE
  USING (
    (audit_log.user_id IS NOT NULL AND audit_log.user_id = auth.uid())
    OR (
      audit_log.vault_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "public"."vaults" v
        JOIN "public"."workspaces" w ON w.id = v.workspace_id
        WHERE v.id = audit_log.vault_id AND w.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    (audit_log.user_id IS NOT NULL AND audit_log.user_id = auth.uid())
    OR (
      audit_log.vault_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "public"."vaults" v
        JOIN "public"."workspaces" w ON w.id = v.workspace_id
        WHERE v.id = audit_log.vault_id AND w.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users delete audit_log own rows" ON "public"."audit_log";
CREATE POLICY "Users delete audit_log own rows"
  ON "public"."audit_log" FOR DELETE
  USING (
    (audit_log.user_id IS NOT NULL AND audit_log.user_id = auth.uid())
    OR (
      audit_log.vault_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "public"."vaults" v
        JOIN "public"."workspaces" w ON w.id = v.workspace_id
        WHERE v.id = audit_log.vault_id AND w.user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- _prisma_migrations: RLS sem políticas
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Novo perfil → workspace "Default"
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_profiles_create_default_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.workspaces (id, user_id, name, created_at)
  VALUES (gen_random_uuid(), NEW.id, 'Default', CURRENT_TIMESTAMP);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_create_default_workspace ON public.profiles;
CREATE TRIGGER trg_profiles_create_default_workspace
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_profiles_create_default_workspace();

NOTIFY pgrst, 'reload schema';
