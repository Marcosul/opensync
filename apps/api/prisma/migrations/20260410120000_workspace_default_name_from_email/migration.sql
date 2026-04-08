-- Nome padrão do workspace ao criar perfil: "{local do email}'s Workspace"

CREATE OR REPLACE FUNCTION public.trg_profiles_create_default_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  local_part text;
  ws_name text;
BEGIN
  local_part := NULLIF(TRIM(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1)), '');
  IF local_part IS NULL OR local_part = '' THEN
    local_part := 'user';
  END IF;
  local_part := LEFT(local_part, 108);
  ws_name := local_part || CHR(39) || 's Workspace';
  IF LENGTH(ws_name) > 120 THEN
    ws_name := LEFT(ws_name, 120);
  END IF;
  INSERT INTO public.workspaces (id, user_id, name, created_at)
  VALUES (gen_random_uuid(), NEW.id, ws_name, CURRENT_TIMESTAMP);
  RETURN NEW;
END;
$$;
