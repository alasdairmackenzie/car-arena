# Car Arena

A TypeScript multiplayer top-down driving playground. Phaser renders;
standalone Matter.js runs authoritative physics on a Node.js/Colyseus server.
See [the approach](docs/approach.md) for architecture and roadmap.

## Run

Requires Node.js 24 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5197 in two browser tabs/windows and click or tab into the
arena. Each browser joins the same available room (up to eight cars). Your car
is mint; other cars are coral. The room ID appears below the arena.

`npm run dev` starts both the game server (port 2567) and Vite (port 5197).
Vite proxies `/game` HTTP and WebSocket traffic to the game server, so browsers
only need the webpage URL. To change the server port, set `GAME_PORT` for both
processes. `npm run dev:client -- --host 0.0.0.0` can expose the webpage on a
trusted LAN while `npm run dev:server` runs separately on the same machine.
This is a local prototype, not a hardened public deployment.

- W / Up: accelerate.
- S / Down: brake by applying reverse thrust, then reverse.
- A / D or Left / Right: steer.
- Space: handbrake.
- R or Reset car: reset position and momentum.

Speed is shown in pixels per second. Desktop keyboard input only for now.
Use http://127.0.0.1:5197/?solo=1 for the original offline single-car playground.
Multiplayer never silently falls back to solo when the server fails.

The server runs at 60 Hz and publishes state at 20 Hz. Browsers smooth received
positions; local prediction is not implemented yet, so network latency is
noticeable. Inputs expire after 500 ms without refresh. Disconnects remove
the car and display an error; reload to join again. Reset chooses an unoccupied
spawn point, which may differ from the original spawn.

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser tests start dedicated game (2677) and Vite (5297) servers; they do
not reuse unrelated running apps. Tests include two independent browser
contexts, remote movement, state convergence, ramming, safe reset, leaving,
connection loss and failed joins.
Physics and server-session tests run without Phaser or a browser.

`npm run build` produces the browser assets in `dist`. For deployment, run a
long-lived server with `npm run start:server` and serve `dist` behind a reverse
proxy that forwards `/game` (including WebSocket upgrades) to that server.
HTTPS requires WSS. The Vite development proxy is not included in the build.

## Layout

- `src/shared/simulation.ts`: fixed-step world and tyre-force controller.
- `src/shared/state.ts`: shared Colyseus state schema.
- `src/server/`: authoritative rooms, input expiry and safe spawn selection.
- `src/client/`: Phaser presentation, keyboard input and DOM UI.
- `tests/`: browser acceptance tests.

Handling values are collected in `HANDLING` in the shared simulation. Artwork
is generated from geometric primitives; no downloaded assets are used.

## Milestone history

1. Single-car driving, steering, reverse, handbrake, walls and reset, committed
   before multiplayer.
2. Shared authoritative driving arena with up to eight players, explicit
   connection errors and browser acceptance tests.

Next: one weapon, health and respawn. Prediction and touch controls remain
separate follow-up work.
