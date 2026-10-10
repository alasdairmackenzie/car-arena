# Car Arena: approach

## Goal

A small top-down driving playground where each browser controls a car in the
same arena. Build enjoyable handling first, then multiplayer, then optional
car combat, damage, shields, weapons, pickups and rounds.

## Technology

- TypeScript for browser, server and shared simulation.
- Phaser 3 for rendering, scenes, cameras and presentation.
- Standalone Matter.js for rigid-body simulation and collision response.
- Vite for the browser development server and production build.
- Node.js and Colyseus for authoritative multiplayer rooms in milestone 2.
- Vitest for simulation tests and Playwright for real-browser checks.
- No database, accounts, React or Next.js initially.

Phaser's bundled Matter integration is intentionally not enabled. The shared
simulation imports standalone Matter.js, so browser and server use the same
package and no second physics world competes to move a car.

## Vehicle model

One rectangular rigid body and four mathematical tyre contact points. At each
point, combine linear velocity with rotational velocity, project that velocity
along and across the wheel heading, and apply rolling and lateral resistance.
The front wheel headings change with steering. The handbrake reduces rear
lateral grip and increases rear rolling resistance. Engine force acts along the
body heading. Gravity is zero.

This is an original approximate, arcade-oriented controller inspired by the
principles explained in [Pat Kerr's vehicle article](https://patkerr.co.uk/2d-vehicles/).
No source code or assets from the example are copied. It is not a realistic tyre,
suspension or drivetrain simulator. Matter handles wall and vehicle collisions.
Fast weapons will need swept/raycast hit detection rather than relying on tiny
discrete physics bodies.

## Simulation and rendering

The simulation advances at a fixed 60 Hz, independently of rendering. Browser
catch-up is bounded to avoid a stalled tab producing an enormous update.
Coordinates are pixels; Matter velocities are pixels per base simulation tick.
Displayed speed is pixels per second, not a claim of real-world km/h.

Keep input, simulation and presentation separate. Shared code must not import
Phaser, access browser globals or depend on a scene.

## Multiplayer plan

Each room owns a Matter world. Browsers send throttle, steering and handbrake
inputs, never positions. The server validates inputs, advances physics and
publishes car states at approximately 20 Hz. The server decides collisions,
pickup ownership, hits, damage and respawns.

Milestone 2 starts with interpolated authoritative states. This is deliberately
not local prediction: internet latency will delay the controlled car. Prediction
and reconciliation are a later improvement, requiring input sequence numbers,
acknowledgement and replay; independent rigid-body worlds are not assumed to be
bitwise deterministic.

Clear held controls on blur, visibility changes and disconnect. The server must
expire stale inputs, remove disconnected cars, cap room size and report errors
explicitly. Deployment needs a long-running WebSocket-capable Node process,
not a short-lived serverless request handler.

## Milestones and acceptance

1. Single car: drive, reverse/brake, steer, handbrake, collide with walls, reset;
   verify physics tests, type-check, production build and browser controls.
   Commit this milestone before starting multiplayer.
2. Shared arena: two browser contexts join one room, drive independently, see
   the same cars and collisions, and handle leaving/disconnection. Verify
   server input validation and multi-browser state convergence; commit separately.
3. Combat: one weapon, health, destruction and respawn.
4. One pickup: shield or temporary speed boost.
5. Tune handling, prediction, game modes, more weapons and progression.

## Initial scope

Desktop keyboard controls, a fixed arena and generated geometric artwork.
Responsive scaling is included, but touch/gamepad controls, matchmaking UI,
authentication, persistence and production internet hosting are not milestone 1.
No external artwork or asset licences are needed.

## Implemented through milestone 2

The normal page now joins a Colyseus room, capped at eight players. The original
local playground is retained explicitly at `?solo=1`. Inputs are sent at 20 Hz,
validated and expired after 500 ms without refresh. The room uses Colyseus's
fixed-timestep scheduler at 60 Hz and schema patches at 20 Hz.

Rendering blends toward each new authoritative snapshot over 50 ms, using the
shortest angular path. Large jumps (such as reset) snap instead of interpolating
across the arena. This is simple smoothing, not extrapolation, rollback or local
prediction. Spawn positions are selected away from current cars.

Tests run dedicated local servers and verify two independent browsers, room
identity, independent controls, remote motion, stopped-state convergence,
ramming, safe reset, leaving, failed joins and disconnect feedback. The Phaser
browser bundle is intentionally larger than a typical website bundle; asset
and engine bundle optimisation is future work.
