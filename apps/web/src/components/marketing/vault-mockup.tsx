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
import { ChevronDown, ChevronRight } from "lucide-react";
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

function minDistanceToNearestNeighbor(nodes: GraphNode[], selfId: string): number {
  const self = nodes.find((n) => n.id === selfId);
  if (!self || self.x == null || self.y == null) return Infinity;
  let min = Infinity;
  for (const other of nodes) {
    if (other.id === selfId || other.x == null || other.y == null) continue;
    const d = Math.hypot(self.x - other.x, self.y - other.y);
    if (d < min) min = d;
  }
  return min;
}

/** Fonte menor quando os nós estão mais próximos (evita sobreposição de rótulos). */
function graphLabelFontSizePx(minDist: number): number {
  if (!Number.isFinite(minDist)) return 6;
  if (minDist < 24) return 3.75;
  if (minDist < 32) return 4.25;
  if (minDist < 42) return 4.75;
  if (minDist < 54) return 5.25;
  return 5.75;
}

function graphNodeLabelText(id: string, minDist: number): string {
  const maxLen = minDist < 28 ? 12 : minDist < 40 ? 18 : 24;
  if (id.length <= maxLen) return id;
  const head = Math.max(4, Math.floor((maxLen - 1) / 2));
  const tail = maxLen - 1 - head;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

function labelOffsetYBelowNode(isCenter: boolean): number {
  return isCenter ? 15 : 9.5;
}

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

  return (
    <div className="bg-[#F8F9F8] p-3 sm:p-4">
      <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        GRAPH
      </p>
      <div className="relative flex min-h-[200px] items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-[#FCFDFC] md:min-h-[240px]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full max-w-[220px] cursor-grab touch-none active:cursor-grabbing"
          role="img"
          aria-label="File relation graph"
        >
          <g ref={layerRef}>
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
              const minDist = minDistanceToNearestNeighbor(renderNodes, node.id);
              const fontSize = graphLabelFontSizePx(minDist);
              const labelText = graphNodeLabelText(node.id, minDist);
              const labelY = labelOffsetYBelowNode(node.isCenter);
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
                  <text
                    x={0}
                    y={labelY}
                    textAnchor="middle"
                    dominantBaseline="hanging"
                    fontSize={fontSize}
                    fill="#6b7280"
                    className="pointer-events-none font-mono select-none"
                  >
                    {labelText}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
