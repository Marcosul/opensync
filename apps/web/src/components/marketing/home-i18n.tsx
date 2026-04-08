"use client";

import { ChevronDown, Globe } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type Locale =
  | "en"
  | "ar"
  | "de"
  | "es"
  | "fr"
  | "it"
  | "ja"
  | "ko"
  | "pt-BR"
  | "ru"
  | "zh-CN";

type Messages = {
  nav: { features: string; pricing: string; createAgent: string; signIn: string };
  hero: {
    badge: string;
    titleTop: string;
    titleAccent: string;
    bodyPrefix: string;
    bodySuffix: string;
    startFree: string;
    seeHow: string;
    scrollAria: string;
  };
  manifest: {
    eyebrow: string;
    title: string;
    lead: string;
    principles: Array<{ title: string; body: string }>;
  };
  features: {
    eyebrow: string;
    title: string;
    items: Array<{ title: string; description: string }>;
  };
  pricing: {
    eyebrow: string;
    title: string;
    annual: string;
    monthly: string;
    save: string;
    freeDescription: string;
    proDescription: string;
    teamDescription: string;
    mostPopular: string;
    startFree: string;
    startTrial: string;
    contactUs: string;
    billedAnnualPro: string;
    billedMonthly: string;
    billedAnnualTeam: string;
    freeFeatures: string[];
    proFeatures: string[];
    teamFeatures: string[];
  };
  comparison: {
    eyebrow: string;
    title: string;
    lead: string;
    thFeature: string;
    thObsidian: string;
    thNotion: string;
    opensyncBrand: string;
    opensyncTier: string;
    obsidianColumnHint: string;
    notionColumnHint: string;
    rows: Array<{
      feature: string;
      opensync: string;
      obsidian: string;
      notion: string;
    }>;
    footerTotal: string;
    footnote: string;
  };
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  messages: Messages;
};

const STORAGE_KEY = "opensync-locale";

const BASE_EN: Messages = {
  nav: {
    features: "Features",
    pricing: "Pricing",
    createAgent: "Create your first agent",
    signIn: "Sign in",
  },
  hero: {
    badge: "built for OpenClaw agents",
    titleTop: "Your agent's vault,",
    titleAccent: "always safe. Always synced.",
    bodyPrefix: "Version control, sync, and a beautiful editor for your",
    bodySuffix: "workspace. Git-powered. Obsidian-inspired. Yours.",
    startFree: "start free — no credit card",
    seeHow: "see how it works ↓",
    scrollAria: "Scroll to features",
  },
  manifest: {
    eyebrow: "Manifesto",
    title: "Why we built opensync",
    lead:
      "We believe your agent's knowledge should be portable, versioned, and yours—not locked in a silo.",
    principles: [
      {
        title: "Documentation first",
        body:
          "In the AI era, documentation structured for machines is the source of truth: it is the natural format for building agents and for organizing your knowledge base.",
      },
      {
        title: "Git is the contract",
        body: "Every change is a commit you can diff, branch, and roll back. Your history stays honest and inspectable.",
      },
      {
        title: "Markdown and YAML in the open",
        body: "No proprietary formats—plain files that work in Obsidian, editors, and CI, today and years from now.",
      },
      {
        title: "First-class for agents",
        body: "Built with OpenClaw in mind so automation and humans share one vault, with sync and commits that fit real workflows.",
      },
      {
        title: "Sync without ransom",
        body: "Fair pricing for sync, full history, and a web editor in one place—without stacking extras for basics.",
      },
    ],
  },
  features: {
    eyebrow: "Features",
    title: "Everything Obsidian Sync charges extra for",
    items: [
      {
        title: "Git-powered versioning",
        description:
          "Every change becomes an automatic commit. One-click rollback. Full history.",
      },
      {
        title: "Graph view",
        description:
          "Visualize file links and navigate your agent's knowledge graph.",
      },
      {
        title: "Web editor with [[wikilinks]]",
        description:
          "Edit .md files anywhere with Obsidian-style internal links.",
      },
      {
        title: "Multi-vault",
        description:
          "One vault per agent, multiple projects, each with its own Git repository.",
      },
      {
        title: "OpenClaw plugin",
        description:
          "Install as skill or plugin with zero setup; the agent commits by itself.",
      },
      {
        title: "Multilingual",
        description:
          "UI in multiple languages so global teams can collaborate smoothly.",
      },
    ],
  },
  pricing: {
    eyebrow: "Pricing",
    title: "Everything Obsidian charges separately, in one plan",
    annual: "annual",
    monthly: "monthly",
    save: "save 20%",
    freeDescription: "For testing. No credit card.",
    proDescription: "For people using OpenClaw every day.",
    teamDescription: "For teams running OpenClaw in production.",
    mostPopular: "most popular",
    startFree: "start free",
    startTrial: "start 14-day trial",
    contactUs: "contact us",
    billedAnnualPro: "billed $60/year",
    billedMonthly: "billed month-to-month",
    billedAnnualTeam: "billed $144/user/year",
    freeFeatures: [
      "1 vault / 1 agent",
      "50 retained commits",
      "Read-only web editor",
      "Graph view",
      "Rollback",
    ],
    proFeatures: [
      "Unlimited vaults",
      "Full Git history",
      "Interactive graph view",
      "Web editor + rollback",
      "Multi-device sync",
    ],
    teamFeatures: [
      "Everything in Pro",
      "Shared vaults",
      "Full audit log",
      "SSO / SAML",
      "SLA + dedicated support",
    ],
  },
  comparison: {
    eyebrow: "Compare",
    title: "OpenSync vs Obsidian vs Notion",
    lead:
      "Same markdown-friendly workflow—different tradeoffs for sync, versioning, and agent-native tooling.",
    thFeature: "Feature",
    thObsidian: "Obsidian",
    thNotion: "Notion",
    opensyncBrand: "opensync",
    opensyncTier: "Pro",
    obsidianColumnHint: "App free · Sync & extras",
    notionColumnHint: "Cloud plans · AI optional",
    rows: [
      {
        feature: "Plain Markdown / YAML on disk",
        opensync: "Yes — open files",
        obsidian: "Yes — local vault",
        notion: "Blocks in cloud; export to .md",
      },
      {
        feature: "Git-native history & rollback",
        opensync: "Full repo, every change",
        obsidian: "Not built-in (plugins)",
        notion: "Page history; not Git",
      },
      {
        feature: "Cross-device sync in one plan",
        opensync: "Included with Pro",
        obsidian: "Sync add-on + extras stack",
        notion: "Included (cloud-only)",
      },
      {
        feature: "Offline-first vault",
        opensync: "Yes",
        obsidian: "Yes",
        notion: "Limited without connectivity",
      },
      {
        feature: "Web editor + publish",
        opensync: "Included",
        obsidian: "Publish / Catalyst extra",
        notion: "Built-in in browser",
      },
      {
        feature: "First-class for OpenClaw agents",
        opensync: "Native plugin & skills",
        obsidian: "Community workflows",
        notion: "General workspace / API",
      },
    ],
    footerTotal: "Typical monthly (power user)",
    footnote:
      "Pricing is indicative: Obsidian app is free; Sync, Publish, and Catalyst are separate. Notion tiers vary by seats and AI add-ons.",
  },
};

const PT_BR: Messages = {
  nav: {
    features: "Features",
    pricing: "Pricing",
    createAgent: "Crie seu primeiro agente",
    signIn: "Entrar",
  },
  hero: {
    badge: "ideal para agentes OpenClaw",
    titleTop: "Organize seus projetos",
    titleAccent: "do jeito que a IA entende",
    bodyPrefix: " Crie pastas para base de conhecimento de agentes OpenClaw ou so seu negócio multimilinário.",
    bodySuffix: "Sincronize, versione e edite como um maestro.",
    startFree: "começar grátis — sem cartão",
    seeHow: "ver como funciona ↓",
    scrollAria: "Ir para seção de features",
  },
  manifest: {
    eyebrow: "Manifesto",
    title: "Por que criamos o opensync",
    lead:
      "Acreditamos que o conhecimento do seu agente deve ser portável, versionado e seu—não preso a um silo.",
    principles: [
      {
        title: "Perfeito para agentes OpenClaw",
        body: "Agentes Openclaw podem se auto-suicidar sem querer quando reescreverem configurações ruins. O opensync garante que o conhecimento do seu agente seja sempre seguro e sincronizado.",
      },
      {
        title: "Ideal para organizar qualquer tipo de base de conhecimento",
        body:
          "Na era da IA, a documentação organizada para IA é a \"fonte da verdade\", porque é formato natural de construção de agentes e a organização da sua base de conhecimento.",
      },
      {
        title: "Formatos abertos",
        body: "Crie documentos em formatos abertos (Markdown, YAML e JSON) natualmente entendíveis por agentes, facilmente editáveis por humanos e executáveis por agentes.",
      },
      {
        title: "Git é o contrato",
        body: "Cada mudança é um commit que você pode comparar, ramificar e desfazer. O histórico continua claro e auditável.",
      }
    ],
  },
  features: {
    eyebrow: "Features",
    title: "Tudo que o Obsidian Sync cobra à parte",
    items: [
      {
        title: "Versionamento com Git",
        description:
          "Cada mudança vira commit automático. Rollback em 1 clique. Histórico completo.",
      },
      {
        title: "Graph view",
        description:
          "Visualize links entre arquivos e navegue pelo grafo de conhecimento do agente.",
      },
      {
        title: "Editor web com [[wikilinks]]",
        description:
          "Edite arquivos .md de qualquer lugar com links entre notas como no Obsidian.",
      },
      {
        title: "Multi-vault",
        description:
          "Um vault por agente, múltiplos projetos, cada um com seu próprio repositório Git.",
      },
      {
        title: "Plugin OpenClaw",
        description:
          "Instale como skill ou plugin, sem configuração; o agente commita sozinho.",
      },
      {
        title: "Multilíngue",
        description:
          "Interface em vários idiomas para times globais trabalharem sem atrito.",
      },
    ],
  },
  pricing: {
    eyebrow: "Pricing",
    title: "Toda segurança do OpenSync por um preço acessível",
    annual: "anual",
    monthly: "mensal",
    save: "economize 20%",
    freeDescription: "Para experimentar. Sem cartão.",
    proDescription: "Para quem usa OpenClaw todos os dias.",
    teamDescription: "Para times usando OpenClaw em produção.",
    mostPopular: "mais popular",
    startFree: "começar grátis",
    startTrial: "iniciar teste de 14 dias",
    contactUs: "falar com vendas",
    billedAnnualPro: "cobrado $60/ano",
    billedMonthly: "cobrado mês a mês",
    billedAnnualTeam: "cobrado $144/usuário/ano",
    freeFeatures: [
      "1 vault / 1 agente",
      "50 commits retidos",
      "Editor web somente leitura",
      "Graph view",
      "Rollback",
    ],
    proFeatures: [
      "Vaults ilimitados",
      "Histórico Git completo",
      "Graph view interativo",
      "Editor web + rollback",
      "Sync multi-máquina",
    ],
    teamFeatures: [
      "Tudo do Pro",
      "Vaults compartilhados",
      "Audit log completo",
      "SSO / SAML",
      "SLA + suporte dedicado",
    ],
  },
  comparison: {
    eyebrow: "Comparar",
    title: "OpenSync vs Obsidian vs Notion",
    lead:
      "Mesmo fluxo amigável a Markdown—com tradeoffs diferentes em sync, versionamento e ferramentas para agentes.",
    thFeature: "Recurso",
    thObsidian: "Obsidian",
    thNotion: "Notion",
    opensyncBrand: "opensync",
    opensyncTier: "Pro",
    obsidianColumnHint: "App grátis · Sync e extras",
    notionColumnHint: "Planos na nuvem · IA opcional",
    rows: [
      {
        feature: "Markdown / YAML puro no disco",
        opensync: "Sim — arquivos abertos",
        obsidian: "Sim — vault local",
        notion: "Blocos na nuvem; exporta .md",
      },
      {
        feature: "Histórico Git e rollback",
        opensync: "Repositório completo",
        obsidian: "Não nativo (plugins)",
        notion: "Histórico de página; sem Git",
      },
      {
        feature: "Sync multi-dispositivo no plano",
        opensync: "Incluído no Pro",
        obsidian: "Sync + extras somam",
        notion: "Incluído (só nuvem)",
      },
      {
        feature: "Vault offline-first",
        opensync: "Sim",
        obsidian: "Sim",
        notion: "Limitado sem conexão",
      },
      {
        feature: "Editor web + publicar",
        opensync: "Incluído",
        obsidian: "Publish / Catalyst à parte",
        notion: "Nativo no navegador",
      },
      {
        feature: "Foco em agentes OpenClaw",
        opensync: "Plugin e skills nativos",
        obsidian: "Fluxos da comunidade",
        notion: "Workspace / API genéricos",
      },
    ],
    footerTotal: "Mensal típico (usuário avançado)",
    footnote:
      "Preços indicativos: app Obsidian é grátis; Sync, Publish e Catalyst são separados. Notion varia por assentos e add-ons de IA.",
  },
};

const ES: Messages = {
  ...BASE_EN,
  nav: { ...BASE_EN.nav, features: "Funciones", pricing: "Precios", createAgent: "Crea tu primer agente", signIn: "Iniciar sesión" },
  hero: {
    ...BASE_EN.hero,
    badge: "hecho para agentes OpenClaw",
    titleTop: "La bóveda de tu agente,",
    titleAccent: "siempre segura. Siempre sincronizada.",
    bodyPrefix: "Control de versiones, sincronización y un editor elegante para tu",
    startFree: "empieza gratis — sin tarjeta",
    seeHow: "ver cómo funciona ↓",
    scrollAria: "Ir a funciones",
  },
  features: { ...BASE_EN.features, eyebrow: "Funciones", title: "Todo lo que Obsidian Sync cobra por separado" },
  pricing: {
    ...BASE_EN.pricing,
    eyebrow: "Precios",
    title: "Todo lo que Obsidian cobra por separado, en un solo plan",
    annual: "anual",
    monthly: "mensual",
    save: "ahorra 20%",
    freeDescription: "Para probar. Sin tarjeta.",
    proDescription: "Para quien usa OpenClaw todos los días.",
    teamDescription: "Para equipos usando OpenClaw en producción.",
    mostPopular: "más popular",
    startFree: "empezar gratis",
    startTrial: "iniciar prueba de 14 días",
    contactUs: "contáctanos",
    billedAnnualPro: "facturado $60/año",
    billedMonthly: "facturación mensual",
    billedAnnualTeam: "facturado $144/usuario/año",
  },
};

const MESSAGES: Record<Locale, Messages> = {
  "pt-BR": PT_BR,
  en: BASE_EN,
  es: ES,
  ar: BASE_EN,
  de: BASE_EN,
  fr: BASE_EN,
  it: BASE_EN,
  ja: BASE_EN,
  ko: BASE_EN,
  ru: BASE_EN,
  "zh-CN": BASE_EN,
};

const LANGUAGE_OPTIONS: Array<{ code: Locale; label: string }> = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "pt-BR", label: "Português (Brasil)" },
  { code: "ru", label: "Русский" },
  { code: "zh-CN", label: "简体中文" },
];

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "pt-BR";
  const saved = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (saved && saved in MESSAGES) return saved;
  const nav = window.navigator.language;
  const exact = LANGUAGE_OPTIONS.find((item) => item.code === nav);
  if (exact) return exact.code;
  const short = nav.split("-")[0];
  const shortMatch = LANGUAGE_OPTIONS.find((item) => item.code.startsWith(short));
  return shortMatch?.code ?? "pt-BR";
}

export function HomeI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => detectInitialLocale());

  const updateLocale = useCallback((next: Locale) => {
    setLocale(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    return {
      locale,
      setLocale: updateLocale,
      messages: MESSAGES[locale] ?? BASE_EN,
    };
  }, [locale, updateLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useHomeI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useHomeI18n must be used inside HomeI18nProvider");
  }
  return context;
}

export function LanguageDropdown() {
  const { locale, setLocale } = useHomeI18n();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border/80 bg-background px-3 text-sm text-foreground shadow-sm transition-colors hover:bg-muted"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Choose language"
      >
        <Globe className="size-4" aria-hidden />
        <ChevronDown className="size-4" aria-hidden />
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-white/10 bg-[#1c1f22] p-2 shadow-2xl">
          <ul role="listbox" className="max-h-80 space-y-0.5 overflow-auto pr-1">
            {LANGUAGE_OPTIONS.map((option) => {
              const active = option.code === locale;
              return (
                <li key={option.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setLocale(option.code);
                      setOpen(false);
                    }}
                    className={
                      active
                        ? "flex w-full items-center rounded-md bg-white/10 px-3 py-2 text-left text-base text-white"
                        : "flex w-full items-center rounded-md px-3 py-2 text-left text-base text-zinc-200 transition-colors hover:bg-white/5"
                    }
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
