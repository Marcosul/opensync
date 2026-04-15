/**
 * Servidor Yjs compatível com `WebsocketProvider` de `y-websocket` (protocolo binário).
 * O pacote `y-websocket` v3+ não inclui mais `bin/utils`; esta lógica segue o antigo
 * `y-websocket@1.5` (relay em memória por nome de documento).
 */
import type { IncomingMessage } from 'node:http';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import type { RawData } from 'ws';
import WebSocket from 'ws';

const messageSync = 0;
const messageAwareness = 1;

/** Documentos ativos por sala (nome = room / docName). */
export const yjsDocs = new Map<string, WSSharedDoc>();

class WSSharedDoc extends Y.Doc {
  readonly name: string;
  /** Conexões WebSocket ativas neste documento. */
  readonly conns = new Map<WebSocket, Set<number>>();
  readonly awareness: awarenessProtocol.Awareness;

  constructor(name: string, gc: boolean) {
    super({ gc });
    this.name = name;
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);

    const awarenessChangeHandler = (
      {
        added,
        updated,
        removed,
      }: {
        added: number[];
        updated: number[];
        removed: number[];
      },
      origin: unknown,
    ) => {
      const changedClients = added.concat(updated, removed);
      const conn = origin as WebSocket | null;
      if (conn !== null) {
        const controlled = this.conns.get(conn);
        if (controlled !== undefined) {
          added.forEach((clientID: number) => controlled.add(clientID));
          removed.forEach((clientID: number) => controlled.delete(clientID));
        }
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
      );
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => {
        send(this, c, buff);
      });
    };

    this.awareness.on('update', awarenessChangeHandler);

    this.on('update', (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      this.conns.forEach((_, conn) => {
        if (conn !== origin) {
          send(this, conn, message);
        }
      });
    });
  }
}

function getYDoc(docname: string, gc: boolean): WSSharedDoc {
  let doc = yjsDocs.get(docname);
  if (!doc) {
    doc = new WSSharedDoc(docname, gc);
    yjsDocs.set(docname, doc);
  }
  return doc;
}

function send(doc: WSSharedDoc, conn: WebSocket, m: Uint8Array): void {
  if (
    conn.readyState !== WebSocket.CONNECTING &&
    conn.readyState !== WebSocket.OPEN
  ) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(m, (err) => {
      if (err != null) closeConn(doc, conn);
    });
  } catch {
    closeConn(doc, conn);
  }
}

function messageListener(
  conn: WebSocket,
  doc: WSSharedDoc,
  message: Uint8Array,
): void {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case messageSync: {
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      }
      case messageAwareness: {
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn,
        );
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(err);
  }
}

function closeConn(doc: WSSharedDoc, conn: WebSocket): void {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn)!;
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(
      doc.awareness,
      Array.from(controlledIds),
      null,
    );
  }
  try {
    conn.close();
  } catch {
    /* ignore */
  }
}

function rawDataToUint8Array(data: RawData): Uint8Array {
  if (Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(Buffer.concat(data));
}

const pingTimeout = 30_000;

export function setupYjsWsConnection(
  conn: WebSocket,
  _req: IncomingMessage,
  {
    docName,
    gc = true,
  }: {
    docName: string;
    gc?: boolean;
  },
): void {
  conn.binaryType = 'arraybuffer';

  const doc = getYDoc(docName, gc);
  doc.conns.set(conn, new Set());

  conn.on('message', (message: RawData) => {
    messageListener(conn, doc, rawDataToUint8Array(message));
  });

  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) {
        closeConn(doc, conn);
      }
      clearInterval(pingInterval);
    } else if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch {
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, pingTimeout);

  conn.on('close', () => {
    closeConn(doc, conn);
    clearInterval(pingInterval);
  });

  conn.on('pong', () => {
    pongReceived = true;
  });

  {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(doc, conn, encoding.toUint8Array(encoder));

    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const enc2 = encoding.createEncoder();
      encoding.writeVarUint(enc2, messageAwareness);
      encoding.writeVarUint8Array(
        enc2,
        awarenessProtocol.encodeAwarenessUpdate(
          doc.awareness,
          Array.from(awarenessStates.keys()),
        ),
      );
      send(doc, conn, encoding.toUint8Array(enc2));
    }
  }
}
