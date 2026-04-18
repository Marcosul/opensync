import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, NotFoundException } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { VaultFilesService } from './vault-files.service';

@Injectable()
export class VaultMcpService {
  constructor(private readonly vaultFiles: VaultFilesService) {}

  async handlePost(
    vaultId: string,
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody: unknown,
  ): Promise<void> {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = this.buildServer(vaultId);
    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  }

  async handleGet(
    vaultId: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = this.buildServer(vaultId);
    await server.connect(transport);
    await transport.handleRequest(req, res);
  }

  private buildServer(vaultId: string): McpServer {
    const server = new McpServer({ name: 'opensync-vault', version: '1.0.0' });
    this.registerTools(server, vaultId);
    return server;
  }

  private registerTools(server: McpServer, vaultId: string): void {
    server.tool(
      'list_files',
      'Lista todos os ficheiros no vault.',
      {},
      async () => {
        const { entries } = await this.vaultFiles.listTree(vaultId);
        const lines = entries.map((e) => `${e.path} (v${e.version}, ${e.size}B)`).join('\n');
        return { content: [{ type: 'text', text: lines || '(vault vazio)' }] };
      },
    );

    server.tool(
      'read_file',
      'Lê o conteúdo de um ficheiro do vault.',
      { path: z.string().describe('Caminho relativo do ficheiro') },
      async ({ path }) => {
        try {
          const { content } = await this.vaultFiles.getContent(vaultId, path);
          return { content: [{ type: 'text', text: content }] };
        } catch (err) {
          if (err instanceof NotFoundException) {
            return { content: [{ type: 'text', text: `Ficheiro não encontrado: ${path}` }], isError: true };
          }
          throw err;
        }
      },
    );

    server.tool(
      'write_file',
      'Cria ou substitui um ficheiro no vault.',
      {
        path: z.string().describe('Caminho relativo do ficheiro'),
        content: z.string().describe('Conteúdo UTF-8 do ficheiro'),
      },
      async ({ path, content }) => {
        let baseVersion: string | null = null;
        try {
          const existing = await this.vaultFiles.getContent(vaultId, path);
          baseVersion = existing.version;
        } catch {
          // ficheiro novo — baseVersion fica null
        }
        const result = await this.vaultFiles.upsertWithBaseVersion(vaultId, path, content, baseVersion);
        return { content: [{ type: 'text', text: `Guardado: ${result.path} v${result.version}` }] };
      },
    );

    server.tool(
      'delete_file',
      'Apaga um ficheiro do vault.',
      { path: z.string().describe('Caminho relativo do ficheiro') },
      async ({ path }) => {
        let version: string;
        try {
          const existing = await this.vaultFiles.getContent(vaultId, path);
          version = existing.version;
        } catch {
          return { content: [{ type: 'text', text: `Ficheiro não encontrado: ${path}` }], isError: true };
        }
        await this.vaultFiles.deleteWithBaseVersion(vaultId, path, version);
        return { content: [{ type: 'text', text: `Apagado: ${path}` }] };
      },
    );

    server.tool(
      'rename_file',
      'Renomeia ou move um ficheiro dentro do vault.',
      {
        from: z.string().describe('Caminho atual do ficheiro'),
        to: z.string().describe('Novo caminho do ficheiro'),
      },
      async ({ from, to }) => {
        let version: string;
        try {
          const existing = await this.vaultFiles.getContent(vaultId, from);
          version = existing.version;
        } catch {
          return { content: [{ type: 'text', text: `Ficheiro não encontrado: ${from}` }], isError: true };
        }
        const result = await this.vaultFiles.renameWithBaseVersion(vaultId, from, to, version);
        return { content: [{ type: 'text', text: `Renomeado: ${result.from_path} → ${result.to_path}` }] };
      },
    );

    server.tool(
      'search_files',
      'Pesquisa ficheiros por nome ou conteúdo.',
      { query: z.string().describe('Texto a pesquisar (nome ou conteúdo)') },
      async ({ query }) => {
        const { files } = await this.vaultFiles.getAllContents(vaultId);
        const q = query.toLowerCase();
        const matches = files.filter(
          (f) => f.path.toLowerCase().includes(q) || f.content.toLowerCase().includes(q),
        );
        if (matches.length === 0) {
          return { content: [{ type: 'text', text: 'Nenhum resultado.' }] };
        }
        const lines = matches.map((f) => f.path).join('\n');
        return { content: [{ type: 'text', text: lines }] };
      },
    );
  }
}
