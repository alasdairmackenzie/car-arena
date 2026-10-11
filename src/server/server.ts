import { createServer, type IncomingMessage } from 'node:http';
import { matchMaker, Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { ArenaRoom } from './room';
import { lobbySettings, type LobbySummary } from '../shared/lobby';

export interface GameServerOptions {
  /** Built client directory to serve alongside the game, for single-service hosting. */
  staticDir?: string;
}

export async function listLobbies(): Promise<LobbySummary[]> {
  const rooms = await matchMaker.query({ name: 'arena' });
  return rooms
    .filter(room => !room.private && !room.locked)
    .map(room => ({
      ...lobbySettings(room.metadata),
      roomId: room.roomId,
      humans: typeof room.metadata?.humans === 'number' ? room.metadata.humans : room.clients,
    }))
    .sort((a, b) => b.humans - a.humans || a.name.localeCompare(b.name));
}

export function createGameServer(room: typeof ArenaRoom = ArenaRoom, options: GameServerOptions = {}): Server {
  const httpServer = createServer();
  // The client always talks to /game (Vite proxies and strips it in dev); strip it here for production.
  // Colyseus prepends its own request listener at listen time, so rewrite before any listener runs.
  const emit = httpServer.emit.bind(httpServer);
  httpServer.emit = ((event: string, ...args: unknown[]) => {
    if (event === 'request' || event === 'upgrade') {
      const request = args[0] as IncomingMessage;
      if (request.url === '/game' || request.url?.startsWith('/game/') || request.url?.startsWith('/game?')) {
        request.url = request.url.slice(5) || '/';
        if (request.url.startsWith('?')) request.url = `/${request.url}`;
      }
    }
    return emit(event, ...args);
  }) as typeof httpServer.emit;
  const server = new Server({
    transport: new WebSocketTransport({ server: httpServer, maxPayload: 4096 }),
    express: app => {
      app.get('/health', (_request, response) => response.json({ ok: true }));
      app.get('/lobbies', async (_request, response) => {
        response.set('Cache-Control', 'no-store').json(await listLobbies());
      });
      if (options.staticDir) app.use(express.static(options.staticDir));
    },
  });
  server.define('arena', room);
  return server;
}
