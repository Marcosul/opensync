"use client";

/**
 * Vista grafo em ecrã cheio (d3-force + zoom). Destaca o ficheiro ativo e hover.
 */
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { useEffect, useMemo, useRef, useState } from "react";

import type { GLink, GNode } from "./vault-graph-model";

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

export function FullGraph({
  graph,
  onSelectFile,
  highlightId,
}: {
  graph: { nodes: GNode[]; links: GLink[] };
  onSelectFile: (id: string) => void;
  highlightId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [renderNodes, setRenderNodes] = useState<GNode[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);

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
          .strength(0.7),
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
        })),
      );
    });

    return () => sim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, graph]);

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
          {graph.links.map((link, i) => {
            const srcId = typeof link.source === "string" ? link.source : link.source.id;
            const tgtId = typeof link.target === "string" ? link.target : link.target.id;
            const src = nodeById.get(srcId);
            const tgt = nodeById.get(tgtId);
            if (!src || !tgt) return null;
            const isHighlighted =
              (highlightId !== null && (srcId === highlightId || tgtId === highlightId)) ||
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

      {hoverId && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs text-foreground shadow-sm">
          {hoverId}
        </div>
      )}
    </div>
  );
}
