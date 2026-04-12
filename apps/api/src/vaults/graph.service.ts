import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

export type GraphNode = {
  id: string;
  label: string;
  type: 'markdown' | 'file';
  path: string;
};

export type GraphEdge = {
  source: string;
  target: string;
  type: 'wikilink' | 'link';
};

export type VaultGraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  fileCount: number;
};

@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOrBuildGraph(vaultId: string): Promise<VaultGraphData> {
    const existing = await this.prisma.vaultGraph.findUnique({
      where: { vaultId },
    });
    if (existing) {
      return existing.graphJson as VaultGraphData;
    }
    return this.buildAndCache(vaultId);
  }

  async buildAndCache(vaultId: string): Promise<VaultGraphData> {
    const files = await this.prisma.vaultFile.findMany({
      where: { vaultId, deletedAt: null },
      select: { path: true, content: true },
    });

    const graph = this.buildGraph(files);

    await this.prisma.vaultGraph.upsert({
      where: { vaultId },
      update: { graphJson: graph as object, generatedAt: new Date() },
      create: { vaultId, graphJson: graph as object },
    });

    this.logger.log(`Grafo construído vault=${vaultId} nodes=${graph.nodes.length} edges=${graph.edges.length}`);
    return graph;
  }

  private buildGraph(files: { path: string; content: string | null }[]): VaultGraphData {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const pathSet = new Set(files.map((f) => f.path));
    const edgeSet = new Set<string>();

    for (const file of files) {
      const isMarkdown = /\.(md|mdx)$/.test(file.path);
      nodes.push({
        id: file.path,
        label: this.getLabel(file.path),
        type: isMarkdown ? 'markdown' : 'file',
        path: file.path,
      });

      if (!isMarkdown || !file.content) continue;

      // Extrair [[wikilinks]] e [[wikilink|alias]]
      for (const match of file.content.matchAll(/\[\[([^\]|#\n]+?)(?:[|#][^\]]*)?\]\]/g)) {
        const target = match[1].trim();
        const resolved = this.resolveWikilink(target, file.path, pathSet);
        if (resolved && resolved !== file.path) {
          const key = `${file.path}→${resolved}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ source: file.path, target: resolved, type: 'wikilink' });
          }
        }
      }

      // Extrair links markdown [texto](caminho-relativo)
      for (const match of file.content.matchAll(/\[([^\]]*)\]\(([^)#\s]+)/g)) {
        const href = match[2].trim();
        if (href.startsWith('http') || href.startsWith('mailto:')) continue;
        const resolved = this.resolveMdLink(href, file.path, pathSet);
        if (resolved && resolved !== file.path) {
          const key = `${file.path}→${resolved}`;
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ source: file.path, target: resolved, type: 'link' });
          }
        }
      }
    }

    return { nodes, edges, fileCount: files.length };
  }

  private getLabel(path: string): string {
    const filename = path.split('/').pop() ?? path;
    return filename.replace(/\.(md|mdx|txt)$/, '') || filename;
  }

  private resolveWikilink(target: string, fromPath: string, pathSet: Set<string>): string | null {
    // Correspondência exacta
    if (pathSet.has(target)) return target;
    if (pathSet.has(`${target}.md`)) return `${target}.md`;

    // Relativo à pasta do arquivo actual
    const dir = fromPath.includes('/') ? fromPath.split('/').slice(0, -1).join('/') : '';
    if (dir) {
      const rel = `${dir}/${target}`;
      if (pathSet.has(rel)) return rel;
      if (pathSet.has(`${rel}.md`)) return `${rel}.md`;
    }

    // Busca por nome de arquivo em qualquer pasta
    const lower = target.toLowerCase();
    for (const p of pathSet) {
      const name = (p.split('/').pop() ?? '').toLowerCase();
      if (name === lower || name === `${lower}.md` || name === `${lower}.mdx`) {
        return p;
      }
    }

    return null;
  }

  private resolveMdLink(href: string, fromPath: string, pathSet: Set<string>): string | null {
    const withoutAnchor = href.split('#')[0];
    if (!withoutAnchor) return null;

    const dir = fromPath.includes('/') ? fromPath.split('/').slice(0, -1).join('/') : '';
    let resolved = withoutAnchor.startsWith('/')
      ? withoutAnchor.slice(1)
      : dir
        ? `${dir}/${withoutAnchor}`
        : withoutAnchor;

    // Normalizar ./
    resolved = resolved.replace(/\/\.\//g, '/').replace(/^\.\//g, '');

    if (pathSet.has(resolved)) return resolved;
    return null;
  }
}
