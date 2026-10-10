# Car Arena

A TypeScript top-down driving playground. Phaser renders; standalone Matter.js
runs the physics. See [the approach](docs/approach.md) for architecture and roadmap.

## Run

Requires Node.js 24 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5197 and click or tab into the arena.

- W / Up: accelerate.
- S / Down: brake by applying reverse thrust, then reverse.
- A / D or Left / Right: steer.
- Space: handbrake.
- R or Reset car: reset position and momentum.

Speed is shown in pixels per second. Desktop keyboard input only for now.
This first milestone runs locally in each browser, not yet in a shared room.

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser tests start a Vite server automatically. Physics tests run without
Phaser or a browser.

## Layout

- `src/shared/simulation.ts`: fixed-step world and tyre-force controller.
- `src/client/`: Phaser presentation, keyboard input and DOM UI.
- `tests/`: browser acceptance tests.

Handling values are collected in `HANDLING` in the shared simulation. Artwork
is generated from geometric primitives; no downloaded assets are used.
