-- Tabela vaults (Nest/Prisma). FK para profiles; sem isto, POST /api/vaults falha no Prisma.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.vaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  gitea_repo text NOT NULL,
  path text NOT NULL DEFAULT './openclaw',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vaults_user_id_idx ON public.vaults (user_id);

NOTIFY pgrst, 'reload schema';
