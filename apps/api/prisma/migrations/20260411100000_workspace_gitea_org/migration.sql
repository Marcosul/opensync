-- Uma organização Gitea por workspace (username estável: ws + uuid sem hífens)

ALTER TABLE "public"."workspaces" ADD COLUMN "gitea_org" TEXT;
