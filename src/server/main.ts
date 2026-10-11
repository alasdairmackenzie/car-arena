import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGameServer } from './server';

// Hosts such as Railway provide PORT and need a public bind; local dev keeps GAME_PORT on loopback.
const port = Number(process.env.PORT ?? process.env.GAME_PORT ?? 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT/GAME_PORT must be an integer between 1 and 65535');
}
const host = process.env.HOST ?? (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const clientDir = fileURLToPath(new URL('../../dist', import.meta.url));
const staticDir = process.env.SERVE_CLIENT === 'false' || !existsSync(clientDir) ? undefined : clientDir;

const server = createGameServer(undefined, { staticDir });
await server.listen(port, host);
console.log(`Car Arena server listening on http://${host}:${port}${staticDir ? ' (serving client)' : ''}`);
