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
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
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
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [comfortableLineLength, setComfortableLineLength] = useState(true);
  const [showStatusBar, setShowStatusBar] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(true);
  const [wikilinksEnabled, setWikilinksEnabled] = useState(true);

  const activeSectionData = useMemo(
    () => settingsSections.find((section) => section.id === activeSection),
    [activeSection],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card/30 px-4">
        <div>
          <p className="text-sm font-medium text-foreground/90">Configurações</p>
          <p className="text-xs text-muted-foreground">Experiência inspirada no Obsidian</p>
        </div>
        <Button type="button" variant="outline" size="sm">
          <Sparkles className="size-3.5" />
          Personalizar
        </Button>
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
                Ajuste o ambiente para o seu fluxo de trabalho. Essas opções podem ser conectadas ao
                perfil do usuário em uma próxima etapa.
              </p>
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
                    control={<Switch checked={autoUpdate} onChange={setAutoUpdate} />}
                  />
                  <SettingRow
                    icon={<Languages className="size-4 text-muted-foreground" />}
                    label="Idioma"
                    helpText="Defina o idioma principal da interface."
                    control={
                      <select className={selectClass} defaultValue="pt-BR">
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
                      <select className={selectClass} defaultValue="split">
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
                        checked={comfortableLineLength}
                        onChange={setComfortableLineLength}
                      />
                    }
                  />
                  <SettingRow
                    icon={<Globe className="size-4 text-muted-foreground" />}
                    label="Status do editor"
                    helpText="Mostra o estado atual de edição na barra inferior."
                    control={<Switch checked={showStatusBar} onChange={setShowStatusBar} />}
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
                      <select className={selectClass} defaultValue="last-opened">
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
                    control={<Switch checked={wikilinksEnabled} onChange={setWikilinksEnabled} />}
                  />
                  <SettingRow
                    icon={<Bell className="size-4 text-muted-foreground" />}
                    label="Confirmar antes de excluir arquivos"
                    helpText="Evita remoções acidentais de notas e anexos."
                    control={<Switch checked={confirmDelete} onChange={setConfirmDelete} />}
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
                      <select className={selectClass} defaultValue="system">
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
                    control={<Switch checked onChange={() => null} />}
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
  children: React.ReactNode;
  action?: React.ReactNode;
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
  icon: React.ReactNode;
  label: string;
  helpText: string;
  control: React.ReactNode;
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
