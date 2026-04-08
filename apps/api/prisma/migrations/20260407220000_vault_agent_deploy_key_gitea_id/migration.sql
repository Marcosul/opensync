-- Deploy key Gitea para sync Git a partir da VPS OpenClaw (ver docs/dev/vault-git-api.md)
ALTER TABLE "vaults" ADD COLUMN IF NOT EXISTS "agent_deploy_key_gitea_id" INTEGER;
