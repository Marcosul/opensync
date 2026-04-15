-- Colaboração em workspace: membros, convites, soft-delete e RLS atualizado.

CREATE TYPE "WorkspaceRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');
CREATE TYPE "WorkspaceMemberStatus" AS ENUM ('ACTIVE', 'REMOVED');
CREATE TYPE "WorkspaceInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

ALTER TABLE "public"."workspaces" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE TABLE "public"."workspace_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "status" "WorkspaceMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_members_workspace_id_profile_id_key" ON "public"."workspace_members"("workspace_id", "profile_id");
CREATE INDEX "workspace_members_profile_id_idx" ON "public"."workspace_members"("profile_id");

ALTER TABLE "public"."workspace_members"
  ADD CONSTRAINT "workspace_members_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."workspace_members"
  ADD CONSTRAINT "workspace_members_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "public"."workspace_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "status" "WorkspaceInviteStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "invited_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_invites_token_key" ON "public"."workspace_invites"("token");
CREATE INDEX "workspace_invites_workspace_id_idx" ON "public"."workspace_invites"("workspace_id");
CREATE INDEX "workspace_invites_email_idx" ON "public"."workspace_invites"("email");

CREATE UNIQUE INDEX "workspace_invites_workspace_email_pending_key"
  ON "public"."workspace_invites"("workspace_id", lower("email"))
  WHERE "status" = 'PENDING';

ALTER TABLE "public"."workspace_invites"
  ADD CONSTRAINT "workspace_invites_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."workspace_invites"
  ADD CONSTRAINT "workspace_invites_invited_by_id_fkey"
  FOREIGN KEY ("invited_by_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dono de cada workspace como ADMIN (histórico)
INSERT INTO "public"."workspace_members" ("id", "workspace_id", "profile_id", "role", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), w."id", w."user_id", 'ADMIN'::"WorkspaceRole", 'ACTIVE'::"WorkspaceMemberStatus", w."created_at", w."created_at"
FROM "public"."workspaces" w
WHERE NOT EXISTS (
  SELECT 1 FROM "public"."workspace_members" wm
  WHERE wm."workspace_id" = w."id" AND wm."profile_id" = w."user_id"
);

-- Novo perfil: workspace Default + membership ADMIN
CREATE OR REPLACE FUNCTION public.trg_profiles_create_default_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_ws_id uuid;
BEGIN
  INSERT INTO public.workspaces (id, user_id, name, created_at)
  VALUES (gen_random_uuid(), NEW.id, 'Default', CURRENT_TIMESTAMP)
  RETURNING id INTO new_ws_id;

  INSERT INTO public.workspace_members (workspace_id, profile_id, role, status, created_at, updated_at)
  VALUES (new_ws_id, NEW.id, 'ADMIN'::"WorkspaceRole", 'ACTIVE'::"WorkspaceMemberStatus", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: workspaces e vaults acessíveis ao dono ou membro ativo
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.opensync_can_access_workspace(ws_id uuid, uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = ws_id
      AND w.deleted_at IS NULL
      AND (
        w.user_id = uid
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = w.id
            AND wm.profile_id = uid
            AND wm.status = 'ACTIVE'::"WorkspaceMemberStatus"
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Users can read own workspaces" ON "public"."workspaces";
CREATE POLICY "Users can read own workspaces"
  ON "public"."workspaces" FOR SELECT
  USING (public.opensync_can_access_workspace(id, auth.uid()));

DROP POLICY IF EXISTS "Users can insert own workspaces" ON "public"."workspaces";
CREATE POLICY "Users can insert own workspaces"
  ON "public"."workspaces" FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own workspaces" ON "public"."workspaces";
CREATE POLICY "Users can update own workspaces"
  ON "public"."workspaces" FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.profile_id = auth.uid()
        AND wm.status = 'ACTIVE'::"WorkspaceMemberStatus"
        AND wm.role = 'ADMIN'::"WorkspaceRole"
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.profile_id = auth.uid()
        AND wm.status = 'ACTIVE'::"WorkspaceMemberStatus"
        AND wm.role = 'ADMIN'::"WorkspaceRole"
    )
  );

DROP POLICY IF EXISTS "Users can delete own workspaces" ON "public"."workspaces";
CREATE POLICY "Users can delete own workspaces"
  ON "public"."workspaces" FOR DELETE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.profile_id = auth.uid()
        AND wm.status = 'ACTIVE'::"WorkspaceMemberStatus"
        AND wm.role = 'ADMIN'::"WorkspaceRole"
    )
  );

DROP POLICY IF EXISTS "Users can read own vaults" ON "public"."vaults";
CREATE POLICY "Users can read own vaults"
  ON "public"."vaults" FOR SELECT
  USING (public.opensync_can_access_workspace(vaults.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Users can insert own vaults" ON "public"."vaults";
CREATE POLICY "Users can insert own vaults"
  ON "public"."vaults" FOR INSERT
  WITH CHECK (public.opensync_can_access_workspace(vaults.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Users can update own vaults" ON "public"."vaults";
CREATE POLICY "Users can update own vaults"
  ON "public"."vaults" FOR UPDATE
  USING (public.opensync_can_access_workspace(vaults.workspace_id, auth.uid()))
  WITH CHECK (public.opensync_can_access_workspace(vaults.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Users can delete own vaults" ON "public"."vaults";
CREATE POLICY "Users can delete own vaults"
  ON "public"."vaults" FOR DELETE
  USING (public.opensync_can_access_workspace(vaults.workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Users crud agents in own vaults" ON "public"."agents";
CREATE POLICY "Users crud agents in own vaults"
  ON "public"."agents" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "public"."vaults" v
      WHERE v.id = agents.vault_id
        AND public.opensync_can_access_workspace(v.workspace_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."vaults" v
      WHERE v.id = agents.vault_id
        AND public.opensync_can_access_workspace(v.workspace_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users crud commits in own vaults" ON "public"."commits";
CREATE POLICY "Users crud commits in own vaults"
  ON "public"."commits" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "public"."vaults" v
      WHERE v.id = commits.vault_id
        AND public.opensync_can_access_workspace(v.workspace_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."vaults" v
      WHERE v.id = commits.vault_id
        AND public.opensync_can_access_workspace(v.workspace_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users crud file_links in own vaults" ON "public"."file_links";
CREATE POLICY "Users crud file_links in own vaults"
  ON "public"."file_links" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "public"."vaults" v
      WHERE v.id = file_links.vault_id
        AND public.opensync_can_access_workspace(v.workspace_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."vaults" v
      WHERE v.id = file_links.vault_id
        AND public.opensync_can_access_workspace(v.workspace_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users read audit_log own rows" ON "public"."audit_log";
CREATE POLICY "Users read audit_log own rows"
  ON "public"."audit_log" FOR SELECT
  USING (
    (audit_log.user_id IS NOT NULL AND audit_log.user_id = auth.uid())
    OR (
      audit_log.vault_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "public"."vaults" v
        WHERE v.id = audit_log.vault_id
          AND public.opensync_can_access_workspace(v.workspace_id, auth.uid())
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
        WHERE v.id = audit_log.vault_id
          AND public.opensync_can_access_workspace(v.workspace_id, auth.uid())
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
        WHERE v.id = audit_log.vault_id
          AND public.opensync_can_access_workspace(v.workspace_id, auth.uid())
      )
    )
  )
  WITH CHECK (
    (audit_log.user_id IS NOT NULL AND audit_log.user_id = auth.uid())
    OR (
      audit_log.vault_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "public"."vaults" v
        WHERE v.id = audit_log.vault_id
          AND public.opensync_can_access_workspace(v.workspace_id, auth.uid())
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
        WHERE v.id = audit_log.vault_id
          AND public.opensync_can_access_workspace(v.workspace_id, auth.uid())
      )
    )
  );

ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_members_select" ON "public"."workspace_members";
CREATE POLICY "workspace_members_select"
  ON "public"."workspace_members" FOR SELECT
  USING (
    profile_id = auth.uid()
    OR public.opensync_can_access_workspace(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "workspace_members_write" ON "public"."workspace_members";
CREATE POLICY "workspace_members_write"
  ON "public"."workspace_members" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_members.workspace_id
        AND w.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.profile_id = auth.uid()
        AND wm.status = 'ACTIVE'::"WorkspaceMemberStatus"
        AND wm.role = 'ADMIN'::"WorkspaceRole"
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_members.workspace_id
        AND w.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_members.workspace_id
        AND wm.profile_id = auth.uid()
        AND wm.status = 'ACTIVE'::"WorkspaceMemberStatus"
        AND wm.role = 'ADMIN'::"WorkspaceRole"
    )
  );

ALTER TABLE "public"."workspace_invites" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workspace_invites_select" ON "public"."workspace_invites";
CREATE POLICY "workspace_invites_select"
  ON "public"."workspace_invites" FOR SELECT
  USING (
    public.opensync_can_access_workspace(workspace_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(p.email) = lower(workspace_invites.email)
    )
  );

DROP POLICY IF EXISTS "workspace_invites_write" ON "public"."workspace_invites";
CREATE POLICY "workspace_invites_write"
  ON "public"."workspace_invites" FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_invites.workspace_id
        AND w.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_invites.workspace_id
        AND wm.profile_id = auth.uid()
        AND wm.status = 'ACTIVE'::"WorkspaceMemberStatus"
        AND wm.role = 'ADMIN'::"WorkspaceRole"
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_invites.workspace_id
        AND w.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = workspace_invites.workspace_id
        AND wm.profile_id = auth.uid()
        AND wm.status = 'ACTIVE'::"WorkspaceMemberStatus"
        AND wm.role = 'ADMIN'::"WorkspaceRole"
    )
  );

NOTIFY pgrst, 'reload schema';
