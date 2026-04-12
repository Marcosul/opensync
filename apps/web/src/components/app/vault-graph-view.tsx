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
import { Maximize2, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { GraphEdge, GraphNode, VaultGraphResponse } from "@/app/api/vaults/[id]/graph/route";
import { cn } from "@/lib/utils";

// ---------- tipos internos D3 ----------
type D3Node = GraphNode & { x?: number; y?: number; vx?: number; vy?: number; index?: number };
type D3Link = { source: string | D3Node; target: string | D3Node; type: GraphEdge["type"] };

// ---------- cores ----------
const COLOR_MD = "#1D9E75";       // teal — brand
const COLOR_FILE = "#6b7280";     // cinza
const COLOR_EDGE_WIKI = "#1D9E75";
const COLOR_EDGE_LINK = "#94a3b8";
const COLOR_SELECTED = "#f59e0b";

interface Props {
  data: VaultGraphResponse;
  onNodeClick?: (node: GraphNode) => void;
  className?: string;
}

export function VaultGraphView({ data, onNodeClick, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zoomRef = useRef<any>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

  const resetZoom = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (select(svgRef.current) as any).transition().duration(300).call(zoomRef.current.transform, zoomIdentity);
  }, []);

  const zoomBy = useCallback((factor: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (select(svgRef.current) as any).transition().duration(200).call(zoomRef.current.scaleBy, factor);
  }, []);

  useLayoutEffect(() => {
    const svgEl = svgRef.current;
    const container = containerRef.current;
    if (!svgEl || !container) return;

    const { width, height } = container.getBoundingClientRect();
    const w = width || 800;
    const h = height || 600;

    // ---- preparar dados ----
    const nodeById = new Map<string, D3Node>();
    const nodes: D3Node[] = data.nodes.map((n) => {
      const d: D3Node = { ...n };
      nodeById.set(n.id, d);
      return d;
    });

    const links: D3Link[] = data.edges
      .map((e) => {
        const source = nodeById.get(e.source);
        const target = nodeById.get(e.target);
        if (!source || !target) return null;
        return { source, target, type: e.type } as D3Link;
      })
      .filter((l): l is D3Link => l !== null);

    // ---- SVG ----
    const svg = select(svgEl)
      .attr("width", w)
      .attr("height", h)
      .attr("viewBox", `0 0 ${w} ${h}`);

    svg.selectAll("*").remove();

    // defs: marcador de seta
    svg.append("defs").append("marker")
      .attr("id", "arrow-og")
      .attr("viewBox", "0 -4 8 8")
      .attr("refX", 14)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("fill", COLOR_EDGE_WIKI)
      .attr("opacity", 0.5);

    const g = svg.append("g").attr("class", "graph-root");

    // ---- zoom ----
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zoomBehavior = (zoom as any)()
      .scaleExtent([0.1, 8])
      .on("zoom", (event: { transform: { toString(): string } }) => {
        g.attr("transform", event.transform.toString());
      });
    zoomRef.current = zoomBehavior;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svg as any).call(zoomBehavior);

    // ---- simulação ----
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = (forceSimulation as any)(nodes)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .force("link", (forceLink as any)(links).id((d: D3Node) => d.id).distance(80).strength(0.4))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .force("charge", (forceManyBody as any)().strength(-180))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .force("center", (forceCenter as any)(w / 2, h / 2))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .force("collide", (forceCollide as any)(18));

    // ---- arestas ----
    const link = g.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d: D3Link) => d.type === "wikilink" ? COLOR_EDGE_WIKI : COLOR_EDGE_LINK)
      .attr("stroke-opacity", 0.55)
      .attr("stroke-width", (d: D3Link) => d.type === "wikilink" ? 1.5 : 1)
      .attr("marker-end", (d: D3Link) => d.type === "wikilink" ? "url(#arrow-og)" : null);

    // ---- nós ----
    const node = g.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .on("click", (_event: MouseEvent, d: D3Node) => {
        setSelected((prev) => (prev === d.id ? null : d.id));
        onNodeClick?.(d);
      })
      .on("mouseenter", (event: MouseEvent, d: D3Node) => {
        const rect = (event.target as Element).closest("svg")?.getBoundingClientRect();
        if (!rect) return;
        setTooltip({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top - 28,
          label: d.path,
        });
      })
      .on("mouseleave", () => setTooltip(null));

    node.append("circle")
      .attr("r", (d: D3Node) => d.type === "markdown" ? 7 : 5)
      .attr("fill", (d: D3Node) => d.type === "markdown" ? COLOR_MD : COLOR_FILE)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.9);

    node.append("text")
      .attr("dy", "0.31em")
      .attr("x", 10)
      .attr("font-size", "10px")
      .attr("fill", "currentColor")
      .attr("opacity", 0.8)
      .attr("pointer-events", "none")
      .text((d: D3Node) => (d.label.length > 22 ? d.label.slice(0, 20) + "…" : d.label));

    // ---- tick ----
    sim.on("tick", () => {
      link
        .attr("x1", (d: D3Link) => (d.source as D3Node).x ?? 0)
        .attr("y1", (d: D3Link) => (d.source as D3Node).y ?? 0)
        .attr("x2", (d: D3Link) => (d.target as D3Node).x ?? 0)
        .attr("y2", (d: D3Link) => (d.target as D3Node).y ?? 0);

      node.attr("transform", (d: D3Node) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      sim.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // re-highlight quando selected muda
  useEffect(() => {
    if (!svgRef.current) return;
    select(svgRef.current)
      .selectAll(".nodes g circle")
      .attr("fill", (d: unknown) => {
        const n = d as D3Node;
        if (n.id === selected) return COLOR_SELECTED;
        return n.type === "markdown" ? COLOR_MD : COLOR_FILE;
      })
      .attr("r", (d: unknown) => {
        const n = d as D3Node;
        if (n.id === selected) return 9;
        return n.type === "markdown" ? 7 : 5;
      });
  }, [selected]);

  return (
    <div ref={containerRef} className={cn("relative h-full w-full overflow-hidden", className)}>
      <svg ref={svgRef} className="h-full w-full text-foreground" />

      {/* tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 max-w-[280px] truncate rounded-md border border-border bg-card px-2 py-1 text-xs shadow-md"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.label}
        </div>
      )}

      {/* controles de zoom */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => zoomBy(1.3)}
          className="flex size-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-card hover:text-foreground"
          title="Zoom in"
        >
          <ZoomIn className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.3)}
          className="flex size-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-card hover:text-foreground"
          title="Zoom out"
        >
          <ZoomOut className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={resetZoom}
          className="flex size-7 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-card hover:text-foreground"
          title="Resetar zoom"
        >
          <Maximize2 className="size-3.5" />
        </button>
      </div>

      {/* legenda */}
      <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 rounded-md border border-border bg-card/80 px-3 py-2 text-xs backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full" style={{ background: COLOR_MD }} />
          <span className="text-muted-foreground">Markdown</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block size-2.5 rounded-full" style={{ background: COLOR_FILE }} />
          <span className="text-muted-foreground">Outro arquivo</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-4" style={{ background: COLOR_EDGE_WIKI }} />
          <span className="text-muted-foreground">[[wikilink]]</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-px w-4" style={{ background: COLOR_EDGE_LINK }} />
          <span className="text-muted-foreground">link markdown</span>
        </div>
      </div>

      {/* badge selected */}
      {selected && (
        <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1 text-xs backdrop-blur-sm">
          <RefreshCw className="size-3 text-muted-foreground" />
          <span className="max-w-[300px] truncate text-foreground">{selected}</span>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="ml-1 text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
