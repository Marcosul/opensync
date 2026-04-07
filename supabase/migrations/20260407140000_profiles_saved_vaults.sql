-- Cofres vazios criados pelo usuario (JSON array no perfil).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS saved_vaults jsonb NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
