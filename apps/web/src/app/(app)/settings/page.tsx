"use client";

import {
  Bell,
  Command,
  Globe,
  HelpCircle,
  Languages,
  LayoutTemplate,
  Link2,
  Palette,
  Settings2,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { apiRequest } from "@/api/rest/generic";
import { Button } from "@/components/ui/button";
import { defaultUserSettings, type UserSettings } from "@/lib/user-settings";
import { cn } from "@/lib/utils";

type SettingsSectionId =
  | "about"
  | "editor"
  | "files-links"
  | "appearance"
  | "hotkeys";

type SettingsSection = {
  id: SettingsSectionId;
  title: string;
  subtitle: string;
  icon: typeof Settings2;
};

const settingsSections: SettingsSection[] = [
  { id: "about", title: "Sobre", subtitle: "Versão, idioma e conta", icon: HelpCircle },
  { id: "editor", title: "Editor", subtitle: "Modo de edição e exibição", icon: LayoutTemplate },
  {
    id: "files-links",
    title: "Arquivos & Links",
    subtitle: "Arquivos padrão e wikilinks",
    icon: Link2,
  },
  { id: "appearance", title: "Aparência", subtitle: "Tema, interface e fontes", icon: Palette },
  { id: "hotkeys", title: "Atalhos", subtitle: "Comandos do teclado", icon: Command },
];

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("about");
  const [settings, setSettings] = useState<UserSettings>(defaultUserSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const lastSavedRef = useRef(JSON.stringify(defaultUserSettings));

  const activeSectionData = useMemo(
    () => settingsSections.find((section) => section.id === activeSection),
    [activeSection],
  );

  useEffect(() => {
    let mounted = true;
    async function loadSettings() {
      try {
        const response = await apiRequest<{ ok: boolean; settings: UserSettings }>("/api/settings");
        if (!mounted) return;
        setSettings(response.settings);
        lastSavedRef.current = JSON.stringify(response.settings);
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

  function updateSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaveState("idle");
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

      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-72 shrink-0 border-r border-border bg-muted/20 p-3 lg:block">
          <nav className="space-y-1">
            {settingsSections.map(({ id, title, subtitle, icon: Icon }) => {
              const isActive = id === activeSection;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveSection(id)}
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

        <main className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6">
          <section className="mx-auto w-full max-w-5xl space-y-6">
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {activeSectionData?.title}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Preferências do aplicativo</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Ajuste o ambiente para o seu fluxo de trabalho. As mudanças são salvas automaticamente.
              </p>
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
          </section>
        </main>
      </div>
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
