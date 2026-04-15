import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { WebSocketServer } from 'ws';
import { setupYjsWsConnection } from './collab-yjs-ws-setup';
import { verifyCollabToken } from './collab-token.util';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

const WS_PATH = '/api/collab';

/**
 * MVP de colaboração:
 * - Relay em memória por processo (sem Redis/Postgres para updates Yjs).
 * - Reinício da API limpa documentos ativos; cliente reidrata a partir de Markdown salvo.
 * Evolução sugerida:
 * - Persistir updates Yjs em Redis/Postgres para recuperação resiliente de salas.
 */
@Injectable()
export class CollabYjsService implements OnModuleInit, OnModuleDestroy {
  private wss: WebSocketServer | null = null;
  private rawServer:
    | {
        on: (event: 'upgrade', listener: UpgradeListener) => void;
        off: (event: 'upgrade', listener: UpgradeListener) => void;
      }
    | null = null;

  private readonly onUpgrade: UpgradeListener = (request, socket, head) => {
    const host = request.headers.host ?? 'localhost';
    const url = new URL(request.url ?? '/', `http://${host}`);

    if (url.pathname !== WS_PATH) {
      return;
    }

    const room = (url.searchParams.get('room') ?? '').trim();
    const token = (url.searchParams.get('token') ?? '').trim();
    const secret = process.env.OPENSYNC_COLLAB_SHARED_SECRET?.trim();

    if (!room || !secret || !token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      console.log(
        `${colors.red}🚫 [collab] conexão rejeitada: room/token inválido${colors.reset}`,
      );
      return;
    }
    const verified = verifyCollabToken(token, secret);
    if (!verified) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      console.log(
        `${colors.red}🔐 [collab] token inválido ou expirado${colors.reset}`,
      );
      return;
    }
    const expectedRoom = `lexical:${verified.vaultId}:${verified.docId}`;
    if (room !== expectedRoom) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      console.log(
        `${colors.red}🧱 [collab] room divergente do token${colors.reset}`,
      );
      return;
    }

    if (!this.wss) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      const reqWithRoom = request as IncomingMessage & { url: string };
      reqWithRoom.url = `${WS_PATH}?room=${encodeURIComponent(room)}`;
      // Exposto para observabilidade e possíveis integrações futuras.
      reqWithRoom.headers['x-opensync-user-id'] = verified.userId;
      reqWithRoom.headers['x-opensync-user-name'] = verified.name;

      setupYjsWsConnection(ws, reqWithRoom, {
        docName: room,
        gc: true,
      });

      console.log(
        `${colors.green}🤝 [collab] cliente conectado room=${room} user=${verified.userId}${colors.reset}`,
      );
    });
  };

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  onModuleInit(): void {
    const adapter = this.httpAdapterHost.httpAdapter;
    const instance = adapter?.getInstance() as
      | { server?: { on: UpgradeTarget['on']; off: UpgradeTarget['off'] } }
      | undefined;
    const server = instance?.server;

    if (!server) {
      console.log(
        `${colors.yellow}⚠️ [collab] servidor HTTP não disponível; WS desativado${colors.reset}`,
      );
      return;
    }

    this.wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', this.onUpgrade);
    this.rawServer = server;

    console.log(
      `${colors.cyan}🧠 [collab] Yjs WebSocket ativo em ${WS_PATH} (query: room,token)${colors.reset}`,
    );
  }

  onModuleDestroy(): void {
    this.rawServer?.off('upgrade', this.onUpgrade);
    this.rawServer = null;
    this.wss?.close();
    this.wss = null;
  }
}

type UpgradeListener = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void;

type UpgradeTarget = {
  on: (event: 'upgrade', listener: UpgradeListener) => void;
  off: (event: 'upgrade', listener: UpgradeListener) => void;
};
