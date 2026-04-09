# OpenSync (opensync.space) — Visão estratégica

> **Documento de alto nível.** Define missão, problema, proposta de valor e pilares do produto.  
> **Detalhes técnicos, contratos de API, cliente Ubuntu e critérios de implementação** estão no [PRD unificado](PRDs/opensync_prd_FULL.md).

---

## 1. O que é o OpenSync

**OpenSync** é uma plataforma para manter **pastas de trabalho** (notas, configurações de agentes de IA, repositórios de conhecimento em Markdown) **consistentes e seguras** entre a máquina do usuário e um **vault na nuvem**, com **versionamento por arquivo**, **histórico auditável** e **sem perda silenciosa** quando há edições concorrentes.

O nome de domínio do produto é **opensync.space**. A **API é a fonte da verdade operacional** do sincronismo; integrações como Git (ex.: Gitea) podem existir como espelho ou complemento, sem substituir o modelo de sync orientado a arquivo e versão — conforme detalhado no PRD.

---

## 2. Problema que resolvemos

- Agentes e fluxos de trabalho alteram arquivos de forma **autônoma e contínua**; sem trilha clara de versões, **correções e rollbacks** ficam arriscados.
- Ferramentas que dependem só de **Git por commit** são pouco adequadas a **sync multi-dispositivo em tempo quase real** com **conflitos explícitos por arquivo**.
- Usuários avançados querem algo no espírito de **“Obsidian Sync + API-first”**, com **controle**, **previsibilidade** e opção de **self-host** ou stack transparente.

---

## 3. Proposta de valor

| Pilar | Significado para o usuário |
|--------|----------------------------|
| **Verdade na API** | Estado do vault definido por versões por arquivo e feed incremental; o cliente local alinha-se a isso, não o contrário. |
| **Bidirecional e seguro** | Upload e download; conflitos viram **cópias nomeadas** e registro em log — **não** sobrescrita silenciosa. |
| **Operação contínua** | Agente em **Ubuntu** (`.deb`, `systemd --user`) com watcher + polling, resiliente a rede e reboot. |
| **Gestão central** | Vault e tokens criados no **dashboard**; onboarding clara (“cole o token no cliente”). |
| **Evolução** | Base para editor web, grafo de wikilinks, billing e integrações futuras — sem contradizer o núcleo de sync versionado. |

---

## 4. Para quem é

- Desenvolvedores e power users em **Linux (Ubuntu)** que sincronizam diretórios locais com um vault gerenciado.
- Equipes que tratam pastas de agentes/notas como **ativo versionado**, com necessidade de **auditoria** e **conflitos tratáveis**.
- Quem busca **previsibilidade** (409 em divergência, regras explícitas) em vez de “último write vence” oculto.

---

## 5. Superfícies do produto (visão)

1. **Backend OpenSync** — Postgres, autenticação por token de agente, endpoints de `changes`, `upsert` e `delete` com `base_version`, limites e observabilidade (ver PRD).
2. **Cliente Ubuntu (“agent”)** — processo long-running: SQLite local, fila serial, watcher, poller; empacotamento e systemd conforme PRD.
3. **Dashboard / app web** — criação de vault, emissão de tokens, visão futura de arquivos, timeline e recursos comerciais (landing, planos), alinhados à mesma API e identidade **opensync.space**.
4. **Integrações futuras** — plugins ou skills para outros runtimes de agente podem reutilizar a **mesma API**; não são pré-requisito do MVP descrito no PRD do cliente Ubuntu.

---

## 6. Princípios estratégicos (alinhados ao PRD)

1. **API = fonte da verdade** para versão e feed de mudanças.  
2. **Conflito explícito > perda de dados.**  
3. **Idempotência e resiliência** (retry, backoff, fila única de sync).  
4. **Simplicidade no MVP** — protocolo claro antes de otimizações avançadas (delta, E2E crypto, etc.).  
5. **Falha em espelhos Git não bloqueia** o sync principal baseado em API/DB.

---

## 7. Identidade visual (referência)

| Campo | Valor |
|-------|--------|
| Domínio | opensync.space |
| Cor primária | `#1D9E75` (teal) |
| Cor secundária | `#5DCAA5` |
| Cor escura | `#0F6E56` |
| Font sans / mono | Inter / JetBrains Mono |

Detalhes de tema (Tailwind, shadcn) podem viver em artefatos de repo (`opensync-theme.json`, `globals.css`) quando o front existir.

---

## 8. Modelo de negócio (direção)

Diretriz comercial de alto nível: **freemium** com limites por vault/agente/commits e **tiers pagos** (ex.: Pro / Team) para rollback avançado, editor completo, graph, sync multi-máquina, colaboração e SSO — **sem fixar aqui** cada limite técnico; o PRD e o código do `PlanService` (quando existir) materializam os cortes.

---

## 9. Roadmap estratégico (fases)

| Fase | Foco |
|------|------|
| **MVP** | API `vault_files` + feed incremental + upsert/delete versionados; cliente Ubuntu `.deb` + `opensync init` + systemd; conflitos e deleções conforme PRD. |
| **Crescimento** | Dashboard rico, tempo real (WebSocket/SSE), billing, i18n, observabilidade de produto. |
| **Escala** | Múltiplos vaults por máquina, resolução assistida de conflitos, dispositivos e políticas, otimizações de payload e sync. |

A ordem sugerida de **implementação técnica** está na seção 18 do PRD.

---

## 10. Documentação relacionada

| Documento | Papel |
|-----------|--------|
| [docs/PRDs/opensync_prd_FULL.md](PRDs/opensync_prd_FULL.md) | PRD canônico: arquitetura do cliente, SQLite, API, conflitos, systemd, métricas, pseudocódigo. |
| Planos em `.cursor/plans/` | Rascunhos de execução; a visão e o PRD prevalecem em caso de divergência. |

---

## 11. Referências externas (inspiração técnica)

- [Gitea API](https://gitea.io/api/swagger) — quando usado como espelho ou export.  
- [Supabase](https://supabase.com/docs) — auth, Postgres, Realtime (se adotados no stack web).  
- Padrões de sync com **version vectors / cursores** e **409 em conflito** — alinhados ao contrato descrito no PRD.
