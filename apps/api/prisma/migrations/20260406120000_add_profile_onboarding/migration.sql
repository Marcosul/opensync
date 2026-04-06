-- Onboarding fields on public.profiles (Supabase / PostgreSQL)
-- Apply in Supabase SQL Editor or via: pnpm exec prisma migrate deploy

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_goals text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_usage_context text,
  ADD COLUMN IF NOT EXISTS onboarding_frequency text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);
