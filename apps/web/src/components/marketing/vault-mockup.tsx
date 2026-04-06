"use client";

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { ChevronDown, ChevronRight, Settings, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DOCS,
  OPENCLAW_ROOT_LABEL,
  OPENCLAW_TREE_ROOT,
  type MockDoc,
  type TreeEntry,
} from "@/components/marketing/openclaw-workspace-mock";
import { cn } from "@/lib/utils";

const DOC_BY_ID = Object.fromEntries(DOCS.map((d) => [d.id, d])) as Record<
  string,
  MockDoc
>;

export function VaultMockup() {
  const [selectedId, setSelectedId] = useState<string>("AGENTS.md");
  const doc = DOC_BY_ID[selectedId] ?? DOCS[0];

  const selectFile = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border shadow-sm",
        "bg-[#F8F9F8] ring-1 ring-black/5"
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/80 bg-muted/30 px-4 py-3">
        <span className="size-2.5 rounded-full bg-[#E5E5E0]" />
        <span className="size-2.5 rounded-full bg-[#E5E5E0]" />
        <span className="size-2.5 rounded-full bg-[#E5E5E0]" />
      </div>
      <div className="grid min-h-[280px] grid-cols-1 divide-y divide-border/80 md:min-h-[320px] md:grid-cols-3 md:divide-x md:divide-y-0">
        <FileSidebar selectedId={selectedId} onSelect={selectFile} />
        <EditorPane doc={doc} onSelectFile={selectFile} />
        <GraphPane doc={doc} onSelectFile={selectFile} />
      </div>
    </div>
  );
}

function FileSidebar({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    return new Set([
      "openclaw/workspace",
      "openclaw/workspace/memory",
    ]);
  });

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <div className="bg-[#F8F9F8] p-3 text-left sm:p-4">
      <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        FILES
      </p>
      <p
        className="mb-2 truncate font-mono text-[10px] text-muted-foreground/90"
        title={OPENCLAW_ROOT_LABEL}
      >
        {OPENCLAW_ROOT_LABEL}
      </p>
      <nav aria-label="OpenClaw workspace tree">
        <TreeView
          entries={OPENCLAW_TREE_ROOT.children}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </nav>
    </div>
  );
}

function TreeView({
  entries,
  depth,
  expanded,
  toggle,
  selectedId,
  onSelect,
}: {
  entries: TreeEntry[];
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className={cn("space-y-0.5", depth > 0 && "ml-2 border-l border-border/60 pl-2")}>
      {entries.map((entry) => {
        if (entry.type === "dir") {
          const isOpen = expanded.has(entry.path);
          return (
            <li key={entry.path}>
              <button
                type="button"
                onClick={() => toggle(entry.path)}
                className={cn(
                  "flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left font-mono text-[11px] text-muted-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  "hover:bg-muted/50 hover:text-foreground"
                )}
              >
                {isOpen ? (
                  <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0 opacity-70" aria-hidden />
                )}
                <span className="min-w-0 truncate">{entry.name}/</span>
              </button>
              {isOpen && entry.children.length > 0 ? (
                <TreeView
                  entries={entry.children}
                  depth={depth + 1}
                  expanded={expanded}
                  toggle={toggle}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
              ) : null}
              {isOpen && entry.children.length === 0 ? (
                <p className="px-6 py-1 font-mono text-[10px] text-muted-foreground/50 italic">
                  (empty)
                </p>
              ) : null}
            </li>
          );
        }

        if (entry.type === "file" && "disabled" in entry && entry.disabled) {
          return (
            <li key={`${entry.name}-disabled`}>
              <span className="flex items-center gap-2 rounded-md px-2 py-1.5 font-mono text-[11px] text-muted-foreground/45">
                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/20" aria-hidden />
                {entry.name}
              </span>
            </li>
          );
        }

        if (entry.type === "file" && "docId" in entry) {
          const active = entry.docId === selectedId;
          return (
            <li key={entry.docId}>
              <button
                type="button"
                onClick={() => onSelect(entry.docId)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[11px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    active ? "bg-primary" : "bg-muted-foreground/40"
                  )}
                  aria-hidden
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

function EditorPane({
  doc,
  onSelectFile,
}: {
  doc: MockDoc;
  onSelectFile: (id: string) => void;
}) {
  return (
    <div className="border-border/80 bg-[#F8F9F8] p-3 text-left sm:border-x sm:p-4">
      <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        EDITOR
      </p>
      <div className="space-y-2 font-mono text-xs leading-relaxed sm:text-sm">
        <p className="font-semibold text-foreground"># {doc.id}</p>
        <p className="text-muted-foreground">{doc.body}</p>
        <p>
          {doc.wikilinks.map((target) => {
            const exists = target in DOC_BY_ID;
            return (
              <span key={target} className="mr-1.5 inline text-primary">
                {exists ? (
                  <button
                    type="button"
                    onClick={() => onSelectFile(target)}
                    className="rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    [[{target}]]
                  </button>
                ) : (
                  <span>[[{target}]]</span>
                )}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
}

function shortGraphLabel(fileId: string) {
  if (fileId.startsWith("memory/")) {
    const f = fileId.replace("memory/", "").replace(".md", "");
    return f.length > 8 ? f.slice(5) : f;
  }
  const base = fileId.replace(".md", "");
  return base.length > 6 ? base.slice(0, 6) : base;
}

type GraphNode = SimulationNodeDatum & {
  id: string;
  label: string;
  isCenter: boolean;
};

type GraphLink = SimulationLinkDatum<GraphNode> & {
  source: string | GraphNode;
  target: string | GraphNode;
};

function GraphPane({
  doc,
  onSelectFile,
}: {
  doc: MockDoc;
  onSelectFile: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);

  const width = 220;
  const height = 160;

  const graph = useMemo(() => {
    const validTargets = doc.wikilinks.filter((targetId) => targetId in DOC_BY_ID);
    const nodes: GraphNode[] = [
      { id: doc.id, label: shortGraphLabel(doc.id).toUpperCase(), isCenter: true },
      ...validTargets.map((id) => ({
        id,
        label: shortGraphLabel(id),
        isCenter: false,
      })),
    ];
    const links: GraphLink[] = validTargets.map((targetId) => ({
      source: doc.id,
      target: targetId,
    }));
    return { nodes, links };
  }, [doc.id, doc.wikilinks]);

  const [renderNodes, setRenderNodes] = useState<GraphNode[]>(graph.nodes);

  useEffect(() => {
    const simNodes = graph.nodes.map((node) => ({ ...node }));
    const simLinks = graph.links.map((link) => ({ ...link }));

    const simulation = forceSimulation(simNodes)
      .force("charge", forceManyBody<GraphNode>().strength(-280))
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(simLinks)
          .id((node) => node.id)
          .distance((link) => (((link.source as GraphNode).id === doc.id) ? 52 : 46))
          .strength(1)
      )
      .force("center", forceCenter(width / 2, height / 2))
      .force(
        "collide",
        forceCollide<GraphNode>().radius((node) => (node.isCenter ? 14 : 10))
      )
      .alpha(1)
      .alphaDecay(0.09);

    simulation.on("tick", () => {
      setRenderNodes(
        simNodes.map((node) => ({
          ...node,
          x: Math.max(20, Math.min(width - 20, node.x ?? width / 2)),
          y: Math.max(20, Math.min(height - 20, node.y ?? height / 2)),
        }))
      );
    });

    return () => {
      simulation.stop();
    };
  }, [doc.id, graph.links, graph.nodes]);

  useEffect(() => {
    const svgEl = svgRef.current;
    const layerEl = layerRef.current;
    if (!svgEl || !layerEl) return;

    const svg = select(svgEl);
    const layer = select(layerEl);

    const z = zoom<SVGSVGElement>()
      .scaleExtent([0.55, 4])
      .filter((event) => {
        if (event.type === "wheel") return true;
        const target = event.target as Element | null;
        if (target?.closest?.("[data-graph-node]")) return false;
        return !event.button;
      })
      .on("zoom", (event) => {
        layer.attr("transform", event.transform.toString());
      });

    svg.call(z);
    svg.call(z.transform, zoomIdentity);

    return () => {
      svg.on(".zoom", null);
    };
  }, [doc.id]);

  const nodeById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const node of renderNodes) {
      map.set(node.id, node);
    }
    return map;
  }, [renderNodes]);

  const backgroundGraph = useMemo(() => {
    // Decorative low-opacity clusters to mimic Obsidian's dense background graph.
    const rng = seededRandom(doc.id);
    const clusters = [
      { cx: 34, cy: 48, count: 12 },
      { cx: 188, cy: 34, count: 10 },
      { cx: 188, cy: 134, count: 12 },
      { cx: 40, cy: 132, count: 9 },
    ];

    const points: { id: string; x: number; y: number }[] = [];
    const links: { source: string; target: string }[] = [];

    clusters.forEach((cluster, clusterIndex) => {
      const centerId = `bg-center-${clusterIndex}`;
      points.push({ id: centerId, x: cluster.cx, y: cluster.cy });
      for (let i = 0; i < cluster.count; i += 1) {
        const angle = rng() * Math.PI * 2;
        const radius = 18 + rng() * 34;
        const id = `bg-${clusterIndex}-${i}`;
        points.push({
          id,
          x: cluster.cx + Math.cos(angle) * radius,
          y: cluster.cy + Math.sin(angle) * radius,
        });
        links.push({ source: centerId, target: id });
      }
    });

    return { points, links };
  }, [doc.id]);

  return (
    <div className="bg-[#F8F9F8] p-3 sm:p-4">
      <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        GRAPH
      </p>
      <div className="relative flex min-h-[200px] items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-[#FCFDFC] md:min-h-[240px]">
        <div className="pointer-events-none absolute right-2 top-2 z-10 flex flex-col gap-1">
          <span className="inline-flex size-6 items-center justify-center rounded-md border border-border/70 bg-background/80 text-muted-foreground">
            <Settings className="size-3.5" />
          </span>
          <span className="inline-flex size-6 items-center justify-center rounded-md border border-border/70 bg-background/80 text-muted-foreground">
            <WandSparkles className="size-3.5" />
          </span>
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full max-w-[220px] cursor-grab touch-none active:cursor-grabbing"
          role="img"
          aria-label="File relation graph"
        >
          <g ref={layerRef}>
            {backgroundGraph.links.map((link, index) => {
              const source = backgroundGraph.points.find((p) => p.id === link.source);
              const target = backgroundGraph.points.find((p) => p.id === link.target);
              if (!source || !target) return null;
              return (
                <line
                  key={`bg-link-${index}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="#d1d5db"
                  strokeWidth="0.8"
                  opacity="0.35"
                />
              );
            })}

            {backgroundGraph.points.map((point) => (
              <circle
                key={point.id}
                cx={point.x}
                cy={point.y}
                r={point.id.includes("center") ? 3.5 : 2.4}
                fill="#d1d5db"
                opacity={point.id.includes("center") ? 0.7 : 0.55}
              />
            ))}

            {graph.links.map((link, index) => {
              const sourceId =
                typeof link.source === "string" ? link.source : link.source.id;
              const targetId =
                typeof link.target === "string" ? link.target : link.target.id;
              const source = nodeById.get(sourceId);
              const target = nodeById.get(targetId);
              if (!source || !target) return null;
              return (
                <line
                  key={`${sourceId}-${targetId}-${index}`}
                  x1={source.x ?? width / 2}
                  y1={source.y ?? height / 2}
                  x2={target.x ?? width / 2}
                  y2={target.y ?? height / 2}
                  stroke="#8B5CF6"
                  strokeWidth="1.15"
                  opacity="0.8"
                />
              );
            })}

            {renderNodes.map((node) => {
              const x = node.x ?? width / 2;
              const y = node.y ?? height / 2;
              const radius = node.isCenter ? 9 : 5.5;
              return (
                <g
                  key={node.id}
                  data-graph-node
                  transform={`translate(${x}, ${y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${node.id}`}
                  onClick={() => onSelectFile(node.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectFile(node.id);
                    }
                  }}
                  className="cursor-pointer outline-none"
                >
                  <title>{node.id}</title>
                  {node.isCenter ? (
                    <circle r={12} fill="#8B5CF6" opacity="0.22" />
                  ) : null}
                  <circle
                    r={radius}
                    fill={node.isCenter ? "#8B5CF6" : "#4b5563"}
                    stroke={node.isCenter ? "#8B5CF6" : "#374151"}
                    strokeWidth={node.isCenter ? 0 : 1}
                    className="pointer-events-all"
                  />
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

function seededRandom(seed: string) {
  let state = 0;
  for (let i = 0; i < seed.length; i += 1) {
    state = (state << 5) - state + seed.charCodeAt(i);
    state |= 0;
  }
  return () => {
    state = (1664525 * state + 1013904223) | 0;
    return ((state >>> 0) % 1000) / 1000;
  };
}
