"use client";

import {
  Bell,
  Command,
  Copy,
  CreditCard,
  Globe,
  HelpCircle,
  KeyRound,
  Languages,
  LayoutTemplate,
  Link2,
  Palette,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { apiRequest } from "@/api/rest/generic";
import {
  getUbuntuInstallOnelinerForClient,
  getUbuntuInstallOnelinerForServer,
} from "@/lib/opensync-public-urls";
import { useSyncBaseTheme } from "@/components/theme/base-theme-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { defaultUserSettings, type UserSettings } from "@/lib/user-settings";
import { cn } from "@/lib/utils";

type SettingsSectionId =
  | "about"
  | "billing"
  | "sync"
  | "editor"
  | "files-links"
  | "appearance"
  | "hotkeys"
  | "access-tokens";

type SettingsSection = {
  id: SettingsSectionId;
  title: string;
  subtitle: string;
  icon: typeof Settings2;
};

const settingsSections: SettingsSection[] = [
  { id: "about", title: "Sobre", subtitle: "Versão, idioma e conta", icon: HelpCircle },
  { id: "billing", title: "Cobrança", subtitle: "Crédito, faturas e pagamentos", icon: CreditCard },
  { id: "sync", title: "Sincronização", subtitle: "Planos e armazenamento na nuvem", icon: RefreshCw },
  { id: "editor", title: "Editor", subtitle: "Modo de edição e exibição", icon: LayoutTemplate },
  {
    id: "files-links",
    title: "Arquivos & Links",
    subtitle: "Arquivos padrão e wikilinks",
    icon: Link2,
  },
  { id: "appearance", title: "Aparência", subtitle: "Tema, interface e fontes", icon: Palette },
  { id: "hotkeys", title: "Atalhos", subtitle: "Comandos do teclado", icon: Command },
  {
    id: "access-tokens",
    title: "Tokens de acesso",
    subtitle: "Autenticação para CLI e agentes",
    icon: KeyRound,
  },
];

function getSectionIntro(section: SettingsSectionId): { eyebrow: string; title: string; description: string } {
  const meta = settingsSections.find((s) => s.id === section);
  const fallbackEyebrow = meta?.title ?? "Configurações";

  if (section === "about") {
    return {
      eyebrow: "Sobre",
      title: "Preferências do aplicativo",
      description:
        "Ajuste o ambiente para o seu fluxo de trabalho. As mudanças são salvas automaticamente.",
    };
  }

  if (section === "billing") {
    return {
      eyebrow: "Cobrança",
      title: "Cobrança e pagamentos",
      description:
        "Crédito da conta, faturas, impostos e benefícios. Ações abaixo são visuais até a integração com pagamentos.",
    };
  }

  if (section === "sync") {
    return {
      eyebrow: "Sincronização",
      title: "Sincronização na nuvem",
      description:
        "Sincronize notas entre dispositivos com criptografia de ponta a ponta. Reembolso sem complicações nos primeiros dias, quando o plano estiver ativo.",
    };
  }

  if (section === "access-tokens") {
    return {
      eyebrow: "Tokens de acesso",
      title: "Tokens de acesso",
      description:
        "Gere tokens para autenticar o opensync e outros clientes CLI no seu workspace. Cada token tem acesso somente leitura à lista de vaults e pode gerar tokens de sync para vaults específicos.",
    };
  }

  return {
    eyebrow: fallbackEyebrow,
    title: "Preferências do aplicativo",
    description:
      "Ajuste o ambiente para o seu fluxo de trabalho. As mudanças são salvas automaticamente.",
  };
}

const syncPlanPricing = {
  monthly: {
    standard: { price: "US$ 5", line: "por mês, cobrança mensal" },
    plus: { price: "US$ 10", line: "por mês, cobrança mensal" },
  },
  yearly: {
    standard: { price: "US$ 48", line: "por ano, cobrança anual" },
    plus: { price: "US$ 96", line: "por ano, cobrança anual" },
  },
} as const;

function parseSettingsSectionParam(raw: string | null): SettingsSectionId | null {
  if (!raw) return null;
  return settingsSections.some((s) => s.id === raw) ? (raw as SettingsSectionId) : null;
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sectionFromUrl = parseSettingsSectionParam(searchParams.get("section"));
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(
    () => sectionFromUrl ?? "about",
  );

  const selectSection = useCallback(
    (id: SettingsSectionId) => {
      setActiveSection(id);
      router.replace(`/settings?section=${id}`, { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    const parsed = parseSettingsSectionParam(searchParams.get("section"));
    if (parsed) setActiveSection(parsed);
    else setActiveSection("about");
  }, [searchParams]);
  const [syncBillingCycle, setSyncBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [accessTokens, setAccessTokens] = useState<{ id: string; label: string; createdAt: string; lastUsedAt: string | null }[]>([]);
  const [accessTokensLoading, setAccessTokensLoading] = useState(false);
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null);
  const [newTokenLabel, setNewTokenLabel] = useState("");
  const [tokenGenerating, setTokenGenerating] = useState(false);
  const [settings, setSettings] = useState<UserSettings>(defaultUserSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const lastSavedRef = useRef(JSON.stringify(defaultUserSettings));
  const settingsLoadSucceededRef = useRef(false);
  const syncBaseTheme = useSyncBaseTheme();

  const sectionIntro = useMemo(() => getSectionIntro(activeSection), [activeSection]);
  const ubuntuInstallOneliner = useMemo(
    () => getUbuntuInstallOnelinerForClient() || getUbuntuInstallOnelinerForServer(),
    [],
  );

  useEffect(() => {
    let mounted = true;
    async function loadSettings() {
      try {
        const response = await apiRequest<{ ok: boolean; settings: UserSettings }>("/api/settings");
        if (!mounted) return;
        setSettings(response.settings);
        lastSavedRef.current = JSON.stringify(response.settings);
        settingsLoadSucceededRef.current = true;
        setSaveState("saved");
      } catch (error) {
        if (!mounted) return;
        const message =
          error instanceof Error ? error.message : "Nao foi possivel carregar as configuracoes.";
        setSaveError(message);
        setSaveState("error");
      } finally {
        if (!mounted) return;
        setIsLoading(false);
        setHasFetched(true);
      }
    }
    void loadSettings();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasFetched) return;

    const serialized = JSON.stringify(settings);
    if (serialized === lastSavedRef.current) return;

    const timeout = setTimeout(async () => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const response = await apiRequest<{ ok: boolean; settings: UserSettings }>("/api/settings", {
          method: "POST",
          body: { settings },
        });
        lastSavedRef.current = JSON.stringify(response.settings);
        setSaveState("saved");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Nao foi possivel salvar as configuracoes.";
        setSaveError(message);
        setSaveState("error");
      } finally {
        setIsSaving(false);
      }
    }, 450);

    return () => clearTimeout(timeout);
  }, [hasFetched, settings]);

  useEffect(() => {
    if (!hasFetched || !settingsLoadSucceededRef.current) return;
    syncBaseTheme(settings.baseTheme);
  }, [hasFetched, settings.baseTheme, syncBaseTheme]);

  useEffect(() => {
    if (activeSection !== "access-tokens") return;
    let mounted = true;
    setAccessTokensLoading(true);
    void apiRequest<{ keys: { id: string; label: string; createdAt: string; lastUsedAt: string | null }[] }>(
      "/api/user-access-keys",
    )
      .then((r) => { if (mounted) setAccessTokens(r.keys); })
      .catch(() => { if (mounted) setAccessTokens([]); })
      .finally(() => { if (mounted) setAccessTokensLoading(false); });
    return () => { mounted = false; };
  }, [activeSection]);

  function updateSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaveState("idle");
  }

  async function generateAccessToken() {
    setTokenGenerating(true);
    try {
      const result = await apiRequest<{ token: string; id: string; label: string }>(
        "/api/user-access-keys",
        { method: "POST", body: { label: newTokenLabel || "Token de acesso" } },
      );
      setNewTokenValue(result.token);
      setNewTokenLabel("");
      // Recarregar lista
      const list = await apiRequest<{ keys: { id: string; label: string; createdAt: string; lastUsedAt: string | null }[] }>(
        "/api/user-access-keys",
      );
      setAccessTokens(list.keys);
    } catch {
      // erro silencioso — UI não colapsa
    } finally {
      setTokenGenerating(false);
    }
  }

  async function revokeAccessToken(id: string) {
    try {
      await apiRequest(`/api/user-access-keys/${encodeURIComponent(id)}`, { method: "DELETE" });
      setAccessTokens((prev) => prev.filter((k) => k.id !== id));
    } catch {
      // erro silencioso
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/30 px-4">
        <div>
          <p className="text-sm font-medium text-foreground/90">Configurações</p>
          <p className="text-xs text-muted-foreground">Experiência inspirada no Obsidian</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {isLoading ? "Carregando..." : isSaving ? "Salvando..." : saveState === "saved" ? "Salvo" : "Pendente"}
          </span>
          <Button type="button" variant="outline" size="sm" disabled>
            <Sparkles className="size-3.5" />
            Preferências
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="shrink-0 border-b border-border bg-muted/20 p-3 lg:hidden">
          <label htmlFor="settings-nav-mobile" className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Seção
          </label>
          <select
            id="settings-nav-mobile"
            className={cn(selectClass, "w-full min-w-0 max-w-full")}
            value={activeSection}
            onChange={(e) => selectSection(e.target.value as SettingsSectionId)}
          >
            {settingsSections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        <aside className="hidden w-72 shrink-0 border-r border-border bg-muted/20 p-3 lg:block">
          <nav className="space-y-1">
            {settingsSections.map(({ id, title, subtitle, icon: Icon }) => {
              const isActive = id === activeSection;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectSection(id)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                    isActive
                      ? "border-primary/30 bg-primary/10"
                      : "border-transparent hover:border-border hover:bg-card",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 items-center justify-center rounded-lg border",
                        isActive ? "border-primary/30 bg-primary/15" : "border-border bg-background",
                      )}
                    >
                      <Icon className="size-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6">
          <section className="mx-auto w-full max-w-5xl space-y-6">
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {sectionIntro.eyebrow}
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight">{sectionIntro.title}</h1>
                  <p className="mt-2 text-sm text-muted-foreground">{sectionIntro.description}</p>
                  {activeSection === "sync" ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      <a href="/" className="font-medium text-primary underline-offset-4 hover:underline">
                        Saiba mais
                      </a>{" "}
                      sobre como a sincronização funciona no OpenSync.
                    </p>
                  ) : null}
                </div>
                {activeSection === "sync" ? (
                  <Link
                    href="/settings/sync/checkout"
                    className={cn(buttonVariants({ size: "sm" }), "shrink-0 sm:self-start")}
                  >
                    Assinar sincronização
                  </Link>
                ) : null}
              </div>
              {saveError ? <p className="mt-2 text-sm text-destructive">{saveError}</p> : null}
            </div>

            {activeSection === "about" ? (
              <div className="grid gap-4">
                <SettingPanel
                  title="Versão 1.12.7"
                  description="Leia as mudanças e mantenha seu app atualizado automaticamente."
                  action={
                    <Button type="button" variant="outline" size="sm">
                      Procurar por atualizações
                    </Button>
                  }
                >
                  <SettingRow
                    icon={<Bell className="size-4 text-muted-foreground" />}
                    label="Atualizar automaticamente"
                    helpText="Desative para evitar verificações automáticas de novas versões."
                    control={
                      <Switch
                        checked={settings.autoUpdate}
                        onChange={(next) => updateSetting("autoUpdate", next)}
                      />
                    }
                  />
                  <SettingRow
                    icon={<Languages className="size-4 text-muted-foreground" />}
                    label="Idioma"
                    helpText="Defina o idioma principal da interface."
                    control={
                      <select
                        className={selectClass}
                        value={settings.language}
                        onChange={(e) => updateSetting("language", e.target.value as UserSettings["language"])}
                      >
                        <option value="pt-BR">Português do Brasil</option>
                        <option value="en-US">English</option>
                        <option value="es-ES">Español</option>
                      </select>
                    }
                  />
                </SettingPanel>
              </div>
            ) : null}

            {activeSection === "billing" ? (
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <BillingRow
                  title="Crédito OpenSync"
                  description={
                    <>
                      <span className="block font-medium text-foreground">US$ 0,00 de saldo</span>
                      <span className="mt-1 block">
                        O crédito pode ser usado para licenças e serviços. Será aplicado antes de cobrar o cartão.
                      </span>
                    </>
                  }
                  action={
                    <Button type="button" size="sm">
                      Comprar crédito
                    </Button>
                  }
                />
                <BillingRow
                  title="Faturas e reembolsos"
                  description="Baixe notas fiscais e solicite reembolsos de pagamentos anteriores."
                  action={
                    <Button type="button" variant="outline" size="sm">
                      Ver
                    </Button>
                  }
                />
                <BillingRow
                  title="Método de pagamento"
                  description="Visualize ou altere o cartão usado nas cobranças."
                  action={
                    <Button type="button" variant="outline" size="sm">
                      Gerenciar
                    </Button>
                  }
                />
                <BillingRow
                  title="Isenção de impostos"
                  description="Cadastre e gerencie isenções quando aplicável à sua região."
                  action={
                    <Button type="button" variant="outline" size="sm">
                      Gerenciar
                    </Button>
                  }
                />
                <BillingRow
                  title="Desconto"
                  description={
                    <>
                      Estudantes, docentes e organizações sem fins lucrativos podem ter desconto em planos elegíveis.{" "}
                      <a href="/" className="font-medium text-primary underline-offset-4 hover:underline">
                        Saiba mais
                      </a>
                      .
                    </>
                  }
                  action={
                    <Button type="button" variant="outline" size="sm">
                      Aplicar
                    </Button>
                  }
                />
                <BillingRow
                  title="Histórico de presentes"
                  description="Você ainda não enviou nem recebeu crédito de presente."
                  action={
                    <Button type="button" variant="outline" size="sm">
                      Resgatar
                    </Button>
                  }
                />
              </div>
            ) : null}

            {activeSection === "sync" ? (
              <div className="space-y-4">
                <div className="flex justify-center sm:justify-start">
                  <div
                    className="inline-flex rounded-full border border-border bg-muted/40 p-1"
                    role="group"
                    aria-label="Ciclo de cobrança"
                  >
                    <button
                      type="button"
                      onClick={() => setSyncBillingCycle("yearly")}
                      className={cn(
                        "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                        syncBillingCycle === "yearly"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Anual
                    </button>
                    <button
                      type="button"
                      onClick={() => setSyncBillingCycle("monthly")}
                      className={cn(
                        "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                        syncBillingCycle === "monthly"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Mensal
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div
                    className={cn(
                      "flex flex-col rounded-2xl border bg-card p-5",
                      "border-primary/40 shadow-sm ring-1 ring-primary/15",
                    )}
                  >
                    <h2 className="text-lg font-semibold">Sync Standard</h2>
                    <p className="mt-3 text-3xl font-semibold tracking-tight">
                      {syncPlanPricing[syncBillingCycle].standard.price}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {syncPlanPricing[syncBillingCycle].standard.line}
                    </p>
                    <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                      <li>1 cofre</li>
                      <li>1 GB de armazenamento total</li>
                      <li>Arquivos até 5 MB</li>
                      <li>1 mês de histórico</li>
                      <li>Dispositivos ilimitados</li>
                      <li>Cofres compartilhados</li>
                    </ul>
                    <Link
                      href="/settings/sync/checkout?plan=standard"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "mt-6 inline-flex w-full sm:w-auto",
                      )}
                    >
                      Escolher Standard
                    </Link>
                  </div>

                  <div className="flex flex-col rounded-2xl border border-border bg-card p-5">
                    <h2 className="text-lg font-semibold">Sync Plus</h2>
                    <p className="mt-3 text-3xl font-semibold tracking-tight">
                      {syncPlanPricing[syncBillingCycle].plus.price}
                    </p>
                    <p className="text-sm text-muted-foreground">{syncPlanPricing[syncBillingCycle].plus.line}</p>
                    <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                      <li>10 cofres</li>
                      <li>10 GB de armazenamento total</li>
                      <li>Arquivos até 200 MB</li>
                      <li>12 meses de histórico</li>
                      <li>Dispositivos ilimitados</li>
                      <li>Cofres compartilhados</li>
                    </ul>
                    <Link
                      href="/settings/sync/checkout?plan=plus"
                      className={cn(buttonVariants({ size: "sm" }), "mt-6 inline-flex w-full sm:w-auto")}
                    >
                      Escolher Plus
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

            {activeSection === "editor" ? (
              <div className="grid gap-4">
                <SettingPanel title="Comportamento do editor" description="Definições de leitura e escrita.">
                  <SettingRow
                    icon={<SlidersHorizontal className="size-4 text-muted-foreground" />}
                    label="Visualização padrão para novas abas"
                    helpText="Escolha entre editar e pré-visualizar ao abrir nova aba."
                    control={
                      <select
                        className={selectClass}
                        value={settings.defaultTabView}
                        onChange={(e) =>
                          updateSetting("defaultTabView", e.target.value as UserSettings["defaultTabView"])
                        }
                      >
                        <option value="split">Visualização e edição</option>
                        <option value="preview">Pré-visualização</option>
                        <option value="editing">Edição</option>
                      </select>
                    }
                  />
                  <SettingRow
                    icon={<LayoutTemplate className="size-4 text-muted-foreground" />}
                    label="Margens de tamanho confortável"
                    helpText="Limita a largura de linhas para leitura mais confortável."
                    control={
                      <Switch
                        checked={settings.comfortableLineLength}
                        onChange={(next) => updateSetting("comfortableLineLength", next)}
                      />
                    }
                  />
                  <SettingRow
                    icon={<Globe className="size-4 text-muted-foreground" />}
                    label="Status do editor"
                    helpText="Mostra o estado atual de edição na barra inferior."
                    control={
                      <Switch
                        checked={settings.showEditorStatus}
                        onChange={(next) => updateSetting("showEditorStatus", next)}
                      />
                    }
                  />
                </SettingPanel>
              </div>
            ) : null}

            {activeSection === "files-links" ? (
              <div className="grid gap-4">
                <SettingPanel
                  title="Padrões de arquivos"
                  description="Defina localização para abrir e criar novas notas."
                >
                  <SettingRow
                    icon={<LayoutTemplate className="size-4 text-muted-foreground" />}
                    label="Arquivo padrão para abrir"
                    helpText="Escolha o arquivo ao iniciar o app."
                    control={
                      <select
                        className={selectClass}
                        value={settings.defaultOpenFile}
                        onChange={(e) =>
                          updateSetting("defaultOpenFile", e.target.value as UserSettings["defaultOpenFile"])
                        }
                      >
                        <option value="last-opened">Último aberto</option>
                        <option value="daily-note">Nota diária</option>
                        <option value="home">Home</option>
                      </select>
                    }
                  />
                  <SettingRow
                    icon={<Link2 className="size-4 text-muted-foreground" />}
                    label="Usar [[wikilinks]]"
                    helpText="Gera links no formato wikilink em vez de markdown."
                    control={
                      <Switch
                        checked={settings.wikilinksEnabled}
                        onChange={(next) => updateSetting("wikilinksEnabled", next)}
                      />
                    }
                  />
                  <SettingRow
                    icon={<Bell className="size-4 text-muted-foreground" />}
                    label="Confirmar antes de excluir arquivos"
                    helpText="Evita remoções acidentais de notas e anexos."
                    control={
                      <Switch
                        checked={settings.confirmDelete}
                        onChange={(next) => updateSetting("confirmDelete", next)}
                      />
                    }
                  />
                </SettingPanel>
              </div>
            ) : null}

            {activeSection === "appearance" ? (
              <div className="grid gap-4">
                <SettingPanel title="Tema e interface" description="Customize aparência e visibilidade.">
                  <SettingRow
                    icon={<Palette className="size-4 text-muted-foreground" />}
                    label="Tema base"
                    helpText="Escolha entre tema claro, escuro ou automático."
                    control={
                      <select
                        className={selectClass}
                        value={settings.baseTheme}
                        onChange={(e) => updateSetting("baseTheme", e.target.value as UserSettings["baseTheme"])}
                      >
                        <option value="system">Adaptar ao sistema</option>
                        <option value="light">Claro</option>
                        <option value="dark">Escuro</option>
                      </select>
                    }
                  />
                  <SettingRow
                    icon={<LayoutTemplate className="size-4 text-muted-foreground" />}
                    label="Mostrar barra de título da aba"
                    helpText="Exibe o cabeçalho no topo de cada aba aberta."
                    control={
                      <Switch
                        checked={settings.showTabTitleBar}
                        onChange={(next) => updateSetting("showTabTitleBar", next)}
                      />
                    }
                  />
                </SettingPanel>
              </div>
            ) : null}

            {activeSection === "hotkeys" ? (
              <div className="grid gap-4">
                <SettingPanel
                  title="Atalhos"
                  description="Pesquise e personalize comandos de teclado."
                  action={
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      <input className={inputClass} placeholder="Filtrar atalho..." />
                      <Button type="button" variant="outline" size="sm">
                        Limpar
                      </Button>
                    </div>
                  }
                >
                  <div className="grid gap-2">
                    {[
                      { name: "Abrir configurações", command: "Ctrl + ," },
                      { name: "Abrir link em nova aba", command: "Ctrl + Enter" },
                      { name: "Abrir ajuda", command: "F1" },
                      { name: "Adicionar link interno", command: "Vazio" },
                    ].map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
                      >
                        <span className="text-sm text-foreground">{item.name}</span>
                        <kbd className="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {item.command}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </SettingPanel>
              </div>
            ) : null}

            {activeSection === "access-tokens" ? (
              <div className="grid gap-4">
                {/* Gerar novo token */}
                <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <div className="mb-4 border-b border-border pb-4">
                    <h2 className="text-base font-semibold">Gerar novo token</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Use tokens <code className="rounded bg-muted px-1 py-0.5 text-xs">usk_...</code> no assistente{" "}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">opensync init</code> (lançado pelo
                      script de instalação ou manualmente).
                    </p>
                  </div>

                  {newTokenValue ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                        Copie o token agora — ele não será exibido novamente.
                      </p>
                      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                        <code className="min-w-0 flex-1 break-all text-xs text-foreground">{newTokenValue}</code>
                        <button
                          type="button"
                          title="Copiar"
                          onClick={() => void navigator.clipboard.writeText(newTokenValue)}
                          className="shrink-0 rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-900"
                        >
                          <Copy className="size-4 text-muted-foreground" />
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setNewTokenValue(null)}
                      >
                        Fechar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                          Descrição (opcional)
                        </label>
                        <input
                          className={inputClass}
                          placeholder="Ex: Laptop pessoal"
                          value={newTokenLabel}
                          onChange={(e) => setNewTokenLabel(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={tokenGenerating}
                        onClick={() => void generateAccessToken()}
                      >
                        <KeyRound className="size-3.5" />
                        {tokenGenerating ? "Gerando..." : "Gerar token"}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Lista de tokens ativos */}
                <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <div className="mb-4 border-b border-border pb-4">
                    <h2 className="text-base font-semibold">Tokens ativos</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Revogue tokens que não estão mais em uso.
                    </p>
                  </div>

                  {accessTokensLoading ? (
                    <p className="text-sm text-muted-foreground">Carregando...</p>
                  ) : accessTokens.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum token ativo.</p>
                  ) : (
                    <div className="space-y-2">
                      {accessTokens.map((key) => (
                        <div
                          key={key.id}
                          className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{key.label}</p>
                            <p className="text-xs text-muted-foreground">
                              Criado em {new Date(key.createdAt).toLocaleDateString("pt-BR")}
                              {key.lastUsedAt
                                ? ` · Usado em ${new Date(key.lastUsedAt).toLocaleDateString("pt-BR")}`
                                : " · Nunca usado"}
                            </p>
                          </div>
                          <button
                            type="button"
                            title="Revogar"
                            onClick={() => void revokeAccessToken(key.id)}
                            className="ml-3 shrink-0 rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Instrução CLI */}
                <div className="rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
                  <h3 className="text-sm font-semibold">Como usar</h3>
                  <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
                    <li>
                      <span className="font-medium text-foreground">1.</span> No Ubuntu (amd64), num terminal — o script
                      instala o pacote e corre <code className="rounded bg-muted px-1 py-0.5 text-xs">opensync init</code>
                      :
                      <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background px-2 py-2 font-mono text-[11px] leading-relaxed text-foreground">
                        {ubuntuInstallOneliner}
                      </pre>
                    </li>
                    <li>
                      <span className="font-medium text-foreground">2.</span> Tenha o token{" "}
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">usk_...</code> à mão quando o assistente
                      pedir.
                    </li>
                  </ol>
                </div>
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}

function BillingRow({
  title,
  description,
  action,
}: {
  title: string;
  description: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function SettingPanel({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function SettingRow({
  icon,
  label,
  helpText,
  control,
}: {
  icon: ReactNode;
  label: string;
  helpText: string;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{helpText}</p>
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full border transition-colors",
        checked ? "border-primary/30 bg-primary" : "border-border bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

const selectClass =
  "h-9 min-w-[180px] rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";

const inputClass =
  "h-9 min-w-[220px] rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40";
