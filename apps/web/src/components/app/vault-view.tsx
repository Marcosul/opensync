"use client";

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { ChevronDown, ChevronRight, GitBranch, Tag, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import { VaultNoteEditor } from "@/components/app/vault-note-editor";
import {
  DOCS,
  OPENCLAW_ROOT_LABEL,
  OPENCLAW_TREE_ROOT,
  findDocBreadcrumb,
  mockDocToMarkdown,
  type MockDoc,
  type TreeEntry,
} from "@/components/marketing/openclaw-workspace-mock";
import { cn } from "@/lib/utils";

const DOC_BY_ID = Object.fromEntries(DOCS.map((d) => [d.id, d])) as Record<string, MockDoc>;

// Derive a "tag" count from how many docs reference each doc (inbound links)
const INBOUND_COUNTS: Record<string, number> = {};
for (const doc of DOCS) {
  for (const target of doc.wikilinks) {
    INBOUND_COUNTS[target] = (INBOUND_COUNTS[target] ?? 0) + 1;
  }
}
const TOP_TAGS = Object.entries(INBOUND_COUNTS)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 14);

type ViewMode = "graph" | "editor";

type VaultUiState = {
  viewMode: ViewMode;
  openTabs: string[];
  activeTabId: string;
};

type VaultUiAction =
  | { type: "open"; id: string }
  | { type: "activate"; id: string }
  | { type: "close"; id: string }
  | { type: "showGraph" };

const initialVaultUi: VaultUiState = {
  viewMode: "graph",
  openTabs: ["AGENTS.md"],
  activeTabId: "AGENTS.md",
};

function vaultUiReducer(state: VaultUiState, action: VaultUiAction): VaultUiState {
  switch (action.type) {
    case "open": {
      const openTabs = state.openTabs.includes(action.id)
        ? state.openTabs
        : [...state.openTabs, action.id];
      return {
        ...state,
        viewMode: "editor",
        openTabs,
        activeTabId: action.id,
      };
    }
    case "activate": {
      if (!state.openTabs.includes(action.id)) return state;
      return { ...state, viewMode: "editor", activeTabId: action.id };
    }
    case "close": {
      const idx = state.openTabs.indexOf(action.id);
      if (idx === -1) return state;
      const openTabs = state.openTabs.filter((t) => t !== action.id);
      let activeTabId = state.activeTabId;
      if (activeTabId === action.id) {
        activeTabId =
          openTabs.length === 0
            ? ""
            : (openTabs[Math.max(0, idx - 1)] ?? openTabs[0]);
      }
      const viewMode: ViewMode = openTabs.length === 0 ? "graph" : state.viewMode;
      return { ...state, openTabs, activeTabId, viewMode };
    }
    case "showGraph":
      return { ...state, viewMode: "graph" };
    default:
      return state;
  }
}

export function VaultView() {
  const [ui, dispatchUi] = useReducer(vaultUiReducer, initialVaultUi);
  const [noteContents, setNoteContents] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const d of DOCS) initial[d.id] = mockDocToMarkdown(d);
    return initial;
  });

  const { viewMode, openTabs, activeTabId } = ui;
  const activeDoc = activeTabId ? DOC_BY_ID[activeTabId] : undefined;

  const selectFile = useCallback((id: string) => {
    dispatchUi({ type: "open", id });
  }, []);

  const closeTab = useCallback((id: string) => {
    dispatchUi({ type: "close", id });
  }, []);

  const activateTab = useCallback((id: string) => {
    dispatchUi({ type: "activate", id });
  }, []);

  const openGraph = useCallback(() => {
    dispatchUi({ type: "showGraph" });
  }, []);

  const graphHighlightId = activeTabId || null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: file tree ── */}
      <FileTree selectedId={activeTabId || null} onSelect={selectFile} />

      {/* ── Center panel ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-card/30 px-2">
          <TabButton active={viewMode === "graph"} onClick={openGraph}>
            <GitBranch className="size-3.5" />
            Grafo
          </TabButton>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1 [scrollbar-width:thin]">
            {openTabs.map((id) => (
              <FileTab
                key={id}
                fileId={id}
                active={viewMode === "editor" && activeTabId === id}
                onSelect={() => activateTab(id)}
                onClose={() => closeTab(id)}
              />
            ))}
          </div>
        </div>

        {/* View */}
        {viewMode === "graph" ? (
          <FullGraph onSelectFile={selectFile} highlightId={graphHighlightId} />
        ) : openTabs.length === 0 || !activeTabId ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center font-mono text-sm text-muted-foreground">
            Nenhum arquivo aberto. Escolha um arquivo na árvore ou no grafo.
          </div>
        ) : (
          <VaultNoteEditor
            key={activeTabId}
            docId={activeTabId}
            value={
              noteContents[activeTabId] ??
              (activeDoc ? mockDocToMarkdown(activeDoc) : `# ${activeTabId}\n\n`)
            }
            onChange={(next) =>
              setNoteContents((prev) => ({ ...prev, [activeTabId]: next }))
            }
            breadcrumb={findDocBreadcrumb(activeTabId)}
            onSelectFile={selectFile}
          />
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="flex w-[200px] shrink-0 flex-col border-l border-border bg-sidebar/30">
        {viewMode === "graph" ? (
          <TagsPanel onSelect={selectFile} />
        ) : openTabs.length === 0 || !activeTabId ? (
          <div className="flex flex-1 items-center px-3 py-4 font-mono text-[10px] text-muted-foreground/70">
            Abra um arquivo para ver backlinks.
          </div>
        ) : (
          <BacklinksPanel
            docId={activeTabId}
            noteContents={noteContents}
            onSelect={selectFile}
          />
        )}
      </div>
    </div>
  );
}

// ─── File tab (com fechar) ─────────────────────────────────────────────────

function FileTab({
  fileId,
  active,
  onSelect,
  onClose,
}: {
  fileId: string;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const shortName = fileId.includes("/") ? fileId.split("/").pop() ?? fileId : fileId;

  return (
    <div
      className={cn(
        "flex max-w-[min(200px,40vw)] shrink-0 items-stretch rounded-md border font-mono text-xs transition-colors",
        active
          ? "border-sidebar-border/60 bg-sidebar-accent text-sidebar-accent-foreground"
          : "border-transparent bg-transparent text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 truncate px-2 py-1 text-left"
        title={fileId}
      >
        {shortName}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="flex shrink-0 items-center justify-center rounded-r-md px-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
        aria-label={`Fechar ${fileId}`}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

// ─── Tab button ────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ─── Full-screen graph (main Obsidian view) ────────────────────────────────

type GNode = {
  id: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  index?: number;
  degree: number;
};
type GLink = { source: string | GNode; target: string | GNode };

function FullGraph({
  onSelectFile,
  highlightId,
}: {
  onSelectFile: (id: string) => void;
  highlightId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [renderNodes, setRenderNodes] = useState<GNode[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);

  // All DOCS as nodes + links from wikilinks
  const graph = useMemo(() => {
    const degreeMap: Record<string, number> = {};
    for (const doc of DOCS) {
      degreeMap[doc.id] = (degreeMap[doc.id] ?? 0) + doc.wikilinks.length;
      for (const t of doc.wikilinks) {
        if (t in DOC_BY_ID) degreeMap[t] = (degreeMap[t] ?? 0) + 1;
      }
    }
    const nodes: GNode[] = DOCS.map((d) => ({ id: d.id, degree: degreeMap[d.id] ?? 0 }));
    const links: GLink[] = [];
    for (const doc of DOCS) {
      for (const t of doc.wikilinks) {
        if (t in DOC_BY_ID) links.push({ source: doc.id, target: t });
      }
    }
    return { nodes, links };
  }, []);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Force simulation
  useEffect(() => {
    const { w, h } = size;
    const simNodes = graph.nodes.map((n) => ({ ...n }));
    const simLinks = graph.links.map((l) => ({ ...l }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = (forceSimulation as any)(simNodes)
      .force("charge", (forceManyBody as any)().strength(-120))
      .force(
        "link",
        (forceLink as any)(simLinks)
          .id((n: GNode) => n.id)
          .distance(60)
          .strength(0.7)
      )
      .force("center", (forceCenter as any)(w / 2, h / 2))
      .force("collide", (forceCollide as any)().radius((n: GNode) => nodeRadius(n) + 4))
      .alpha(1)
      .alphaDecay(0.03);

    sim.on("tick", () => {
      setRenderNodes(
        simNodes.map((n: GNode) => ({
          ...n,
          x: Math.max(16, Math.min(w - 16, n.x ?? w / 2)),
          y: Math.max(16, Math.min(h - 16, n.y ?? h / 2)),
        }))
      );
    });

    return () => sim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  // Zoom & pan
  useEffect(() => {
    const svgEl = svgRef.current;
    const layerEl = layerRef.current;
    if (!svgEl || !layerEl) return;
    const svgSel = select(svgEl);
    const layerSel = select(layerEl);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const z = (zoom as any)()
      .scaleExtent([0.15, 6])
      .filter((e: Event & { type: string; button?: number }) => {
        if (e.type === "wheel") return true;
        const t = e.target as Element | null;
        if (t?.closest?.("[data-node]")) return false;
        return !(e as MouseEvent).button;
      })
      .on("zoom", (e: { transform: { toString(): string } }) => {
        layerSel.attr("transform", e.transform.toString());
      });

    svgSel.call(z);
    svgSel.call(z.transform, zoomIdentity);
    return () => svgSel.on(".zoom", null);
  }, [size]);

  const nodeById = useMemo(() => {
    const m = new Map<string, GNode>();
    for (const n of renderNodes) m.set(n.id, n);
    return m;
  }, [renderNodes]);

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-background">
      {/* Subtle grid background */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.03]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="cursor-grab touch-none active:cursor-grabbing"
        role="img"
        aria-label="Grafo de arquivos"
      >
        <g ref={layerRef}>
          {/* Links */}
          {graph.links.map((link, i) => {
            const srcId = typeof link.source === "string" ? link.source : link.source.id;
            const tgtId = typeof link.target === "string" ? link.target : link.target.id;
            const src = nodeById.get(srcId);
            const tgt = nodeById.get(tgtId);
            if (!src || !tgt) return null;
            const isHighlighted =
              (highlightId !== null &&
                (srcId === highlightId || tgtId === highlightId)) ||
              srcId === hoverId ||
              tgtId === hoverId;
            return (
              <line
                key={`${srcId}-${tgtId}-${i}`}
                x1={src.x ?? 0}
                y1={src.y ?? 0}
                x2={tgt.x ?? 0}
                y2={tgt.y ?? 0}
                stroke={isHighlighted ? "hsl(160 68% 37%)" : "hsl(160 15% 70%)"}
                strokeWidth={isHighlighted ? 1.5 : 0.8}
                opacity={isHighlighted ? 0.9 : 0.35}
              />
            );
          })}

          {/* Nodes */}
          {renderNodes.map((node) => {
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const r = nodeRadius(node);
            const isSelected = highlightId !== null && node.id === highlightId;
            const isHovered = node.id === hoverId;
            const label = shortLabel(node.id);

            return (
              <g
                key={node.id}
                data-node
                transform={`translate(${x},${y})`}
                role="button"
                tabIndex={0}
                aria-label={`Abrir ${node.id}`}
                onClick={() => onSelectFile(node.id)}
                onMouseEnter={() => setHoverId(node.id)}
                onMouseLeave={() => setHoverId(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectFile(node.id);
                  }
                }}
                className="cursor-pointer outline-none"
              >
                <title>{node.id}</title>
                {(isSelected || isHovered) && (
                  <circle r={r + 5} fill="hsl(160 68% 37%)" opacity="0.15" />
                )}
                <circle
                  r={r}
                  fill={
                    isSelected
                      ? "hsl(160 68% 37%)"
                      : isHovered
                        ? "hsl(160 50% 50%)"
                        : "hsl(160 20% 55%)"
                  }
                  stroke={isSelected ? "hsl(160 68% 32%)" : "none"}
                  strokeWidth={1.5}
                />
                {(r >= 5.5 || isSelected || isHovered) && (
                  <text
                    y={r + 9}
                    textAnchor="middle"
                    dominantBaseline="hanging"
                    fontSize={isSelected ? 8 : 7}
                    fontWeight={isSelected ? "600" : "400"}
                    fill={isSelected ? "hsl(160 68% 32%)" : "hsl(160 10% 42%)"}
                    className="pointer-events-none select-none font-mono"
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Tooltip hint */}
      {hoverId && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs text-foreground shadow-sm">
          {hoverId}
        </div>
      )}
    </div>
  );
}

function nodeRadius(n: GNode): number {
  const d = n.degree ?? 0;
  if (d >= 6) return 9;
  if (d >= 4) return 7;
  if (d >= 2) return 5.5;
  return 4;
}

function shortLabel(id: string): string {
  const base = id.replace(".md", "").replace("memory/", "📅 ");
  return base.length > 14 ? base.slice(0, 13) + "…" : base;
}

// ─── Tags panel (graph mode right sidebar) ─────────────────────────────────

function TagsPanel({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex h-10 items-center gap-2 border-b border-border px-3">
        <Tag className="size-3.5 text-muted-foreground" />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Links
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {TOP_TAGS.map(([id, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-sidebar-accent/60"
          >
            <span className="min-w-0 truncate text-muted-foreground hover:text-foreground">
              {id.replace(".md", "")}
            </span>
            <span className="ml-2 shrink-0 tabular-nums text-muted-foreground/60">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Backlinks panel (editor mode right sidebar) ───────────────────────────

function BacklinksPanel({
  docId,
  noteContents,
  onSelect,
}: {
  docId: string;
  noteContents: Record<string, string>;
  onSelect: (id: string) => void;
}) {
  const needle = `[[${docId}]]`;
  const backlinks = useMemo(() => {
    return DOCS.filter(
      (d) => d.id !== docId && (noteContents[d.id] ?? "").includes(needle)
    );
  }, [docId, noteContents, needle]);

  return (
    <div className="flex flex-col overflow-hidden">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Backlinks ({backlinks.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {backlinks.length === 0 ? (
          <p className="px-1 py-2 font-mono text-[10px] italic text-muted-foreground/50">
            Nenhum backlink
          </p>
        ) : (
          <ul className="space-y-0.5">
            {backlinks.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => onSelect(doc.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                  <span className="min-w-0 truncate">{doc.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── File tree ─────────────────────────────────────────────────────────────

function FileTree({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex w-[200px] shrink-0 flex-col border-r border-border bg-sidebar/30">
      <div className="flex h-10 items-center justify-between border-b border-border px-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Arquivos
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        <p
          className="mb-1 truncate px-1 font-mono text-[10px] text-muted-foreground/60"
          title={OPENCLAW_ROOT_LABEL}
        >
          {OPENCLAW_ROOT_LABEL}
        </p>
        <nav aria-label="workspace tree">
          <VaultTreeView
            entries={OPENCLAW_TREE_ROOT.type === "dir" ? OPENCLAW_TREE_ROOT.children : []}
            depth={0}
            initialExpanded={new Set(["openclaw/workspace", "openclaw/workspace/memory"])}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </nav>
      </div>
    </div>
  );
}

function VaultTreeView({
  entries,
  depth,
  initialExpanded,
  selectedId,
  onSelect,
}: {
  entries: TreeEntry[];
  depth: number;
  initialExpanded: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <ul className={cn("space-y-0.5", depth > 0 && "ml-2 border-l border-border/50 pl-2")}>
      {entries.map((entry) => {
        if (entry.type === "dir") {
          const isOpen = expanded.has(entry.path);
          return (
            <li key={entry.path}>
              <button
                type="button"
                onClick={() => toggle(entry.path)}
                className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {isOpen ? (
                  <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0 opacity-60" />
                )}
                <span className="min-w-0 truncate">{entry.name}/</span>
              </button>
              {isOpen && entry.children.length > 0 && (
                <VaultTreeView
                  entries={entry.children}
                  depth={depth + 1}
                  initialExpanded={initialExpanded}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
              )}
              {isOpen && entry.children.length === 0 && (
                <p className="px-5 py-1 font-mono text-[10px] italic text-muted-foreground/40">
                  (vazio)
                </p>
              )}
            </li>
          );
        }

        if (entry.type === "file" && "disabled" in entry && entry.disabled) {
          return (
            <li key={`${entry.name}-disabled`}>
              <span className="flex items-center gap-2 rounded px-2 py-1 font-mono text-[11px] text-muted-foreground/30">
                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/20" />
                {entry.name}
              </span>
            </li>
          );
        }

        if (entry.type === "file" && "docId" in entry) {
          const active = selectedId !== null && entry.docId === selectedId;
          return (
            <li key={entry.docId}>
              <button
                type="button"
                onClick={() => onSelect(entry.docId)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active
                    ? "bg-primary/12 text-primary font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    active ? "bg-primary" : "bg-muted-foreground/35"
                  )}
                />
                <span className="min-w-0 truncate">{entry.name}</span>
              </button>
            </li>
          );
        }

        return null;
      })}
    </ul>
  );
}
