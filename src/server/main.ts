import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ArenaRoom } from './room';

const port = Number(process.env.GAME_PORT ?? 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('GAME_PORT must be an integer between 1 and 65535');
}

const server = new Server({
  transport: new WebSocketTransport({ maxPayload: 4096 }),
  express: app => {
    app.get('/health', (_request, response) => response.json({ ok: true }));
  },
});
server.define('arena', ArenaRoom);
await server.listen(port, '127.0.0.1');
console.log(`Car Arena server listening on http://127.0.0.1:${port}`);
