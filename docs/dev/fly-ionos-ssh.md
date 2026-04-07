# SSH entre Fly (produção) e VPS IONOS

Este documento descreve a chave SSH gerada na máquina de **produção** do Fly (`opensync-api`) para aceder à **VPS IONOS** (Gitea, deploy, `authorized_keys`), e como validar a ligação.

## Contexto

- **Fly app:** `opensync-api` ([`apps/api/fly.toml`](../../apps/api/fly.toml))
- **VPS:** endereço configurado em `IONOS_VPS_IPV4` no [`apps/api/.env`](../../apps/api/.env) (não versionado)
- **Objetivo:** a API ou processos na VM Fly poderem usar `git`/SSH para a IONOS sem password, com chave dedicada

## Chave na máquina Fly

Na imagem de produção (Node slim) não existe `ssh-keygen` por defeito. Foi instalado `openssh-client` no contentor e gerado um par Ed25519:

| Ficheiro | Descrição |
|----------|-----------|
| `/root/.ssh/opensync_deploy_key` | Chave **privada** (nunca commitar) |
| `/root/.ssh/opensync_deploy_key.pub` | Chave **pública** |

**Comando usado (referência):**

```bash
fly ssh console -a opensync-api -C "bash -lc 'apt-get update && apt-get install -y openssh-client && mkdir -p /root/.ssh && chmod 700 /root/.ssh && ssh-keygen -t ed25519 -N \"\" -f /root/.ssh/opensync_deploy_key -C \"opensync-fly-production\"'"
```

## Chave pública (referência)

A chave pública atual (comentário `opensync-fly-production`) é:

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL+zAlxvgDvEQjdtWc/zDtHUnjN+wd61bcDZJ/oxvfUU opensync-fly-production
```

Esta linha deve existir no servidor de destino, por exemplo em `~/.ssh/authorized_keys` do utilizador que recebe SSH (ex.: `root` na VPS).

> Se gerarem um par novo, atualizem este bloco e a entrada no servidor.

## VPS IONOS: autorizar a chave

No host IONOS (ex.: `root@<IONOS_VPS_IPV4>`), garantir:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIL+zAlxvgDvEQjdtWc/zDtHUnjN+wd61bcDZJ/oxvfUU opensync-fly-production' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Evitar duplicar a mesma linha se já existir (`grep` antes de acrescentar).

## Teste de ligação a partir do Fly

Com a chave pública já no servidor:

```bash
fly ssh console -a opensync-api -C "bash -lc 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -i /root/.ssh/opensync_deploy_key -o IdentitiesOnly=yes root@<IONOS_VPS_IPV4> echo OK'"
```

Substituir `<IONOS_VPS_IPV4>` pelo IP real. Saída esperada: `OK` (e eventualmente o aviso de host adicionado ao `known_hosts` na primeira vez).

## Persistência e deploys

O sistema de ficheiros do **contentor** Fly pode ser **recriado** em novos deploys ou substituição da máquina. Se `/root/.ssh/opensync_deploy_key` deixar de existir, a ligação à IONOS falha até voltar a instalar a chave ou a injetar outra.

Opções recomendadas para produção:

1. **Fly secrets** — guardar a chave privada (base64) e um script de entrypoint que escreve `/root/.ssh/opensync_deploy_key` e permissões `600`.
2. **Volume Fly** — montar `/root/.ssh` ou um caminho dedicado só para estas chaves.
3. **Regenerar** — gerar par novo no Fly, atualizar `authorized_keys` na VPS e este documento.

## Referências no repositório

- Deploy Gitea na IONOS: [`deploy/ionos/`](../../deploy/ionos/)
- Variáveis de ambiente da API: [`apps/api/.env.example`](../../apps/api/.env.example) (`GITEA_URL`, `IONOS_*`)
