# Car Arena: approach

## Neon Scrapyard visual direction

Use a native modal pregame menu for rules, controls, pickup explanations and
standings. Connect to the room only after Play, keeping page visitors out of
driver slots and queues until they opt in. Help reopens the same menu; driving
input is inactive while it is open, but the authoritative online round continues.

An after-dark salvage arena with worn asphalt, oil stains, cracks, faded parking
and lane markings, concrete barriers with hazard stripes, and cyan/violet lamps.
Cars retain readable mint/coral ownership colours while gaining armoured bumpers,
bonnet panels and wear marks. Gold cores remain hexagons; power-ups keep distinct
square outlines and symbols. Compact instrument-panel styling preserves the
existing overlay positions and bar-only health.

The static arena art is baked once to a Phaser texture; bounded short-lived
sparks highlight pickups and damage. Reduced-motion preferences suppress sparks
and subtle core pulsing. Generated artwork avoids external assets, fonts and
dependencies. This is a presentation-only pass: walls, handling, controls,
scoring and bot rules are unchanged. Sound and physical scenery remain separate
future work.

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

Players choose or create a lobby before connecting. Each room validates a
1-10 driver limit and an AI toggle; excess humans spectate and queue. The public
lobby list reports room settings and human occupancy, separately from bot slots.

Production runs one Node process serving `dist`, health/lobby HTTP endpoints
and Colyseus WebSockets. `/game` routes are rewritten before transport listeners
run, matching the development proxy. Railway uses the repository's build/start
configuration and one replica; static-only hosting cannot run the game.

## Milestones and acceptance

1. Single car: drive, reverse/brake, steer, handbrake, collide with walls, reset;
   verify physics tests, type-check, production build and browser controls.
   Commit this milestone before starting multiplayer.
2. Shared arena: two browser contexts join one room, drive independently, see
   the same cars and collisions, and handle leaving/disconnection. Verify
   server input validation and multi-browser state convergence; commit separately.
3. Combat: one weapon, health, destruction and respawn.
4. Separate pickups: shield, temporary speed boost and core disruption.
5. Tune handling, prediction, game modes, more weapons and progression.

## Initial scope

Desktop keyboard controls, a fixed arena and generated geometric artwork.
Responsive scaling and mobile touch controls are included, but gamepad controls, matchmaking UI,
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
ramming, leaving, failed joins and disconnect feedback. The Phaser
browser bundle is intentionally larger than a typical website bundle; asset
and engine bundle optimisation is future work.

## Milestone 3: Core Run

The player-approved objective is first to **hold five gold cores**. Cores are
goal items, not power-ups. Destruction drops all carried cores; the disruption
pickup can knock out one core without requiring destruction.

The authoritative session owns inventory, health, projectiles, pickups and
round transitions. The state schema publishes these alongside car poses.
The browser sends a validated `fire` boolean with the driving controls, not
hits, damage values, inventory changes or win claims.

- Three starting cores at random positions, replenished every 0.5-2 seconds
  up to five ground cores. Each expires after a random 8-15 seconds.
  Inventory drops may exceed that cap and have a 0.75-second pickup grace
  period. Disconnecting releases inventory too.
- Pickup checks sweep the car centre across the tick with a 30-pixel pickup
  radius. Contested pickups use closest final position, then player ID.
- Forward gun: 100 health, 25 damage, four shots/second, 1200 pixels/second,
  one-second maximum projectile life, no self-hits or penetration.
- Segment-vs-oriented-box checks account for target translation across the tick
  and sample target orientation at the current tick. They avoid fast bullets
  tunnelling through cars; this is not full continuous rotational collision
  detection or internet lag compensation. Boundary intersections stop shots.
- Dead cars leave the Matter world but remain in room state for their wreck
  marker and countdown. Respawn after three seconds clears input and inventory,
  restores health and gives two seconds of protection. Protection prevents both
  firing and damage, so spawn camping does not grant a protected shooter.
- Manual reset in multiplayer is now self-destruction, not an instant teleport
  or free heal. The explicit offline playground preserves its original reset.
- A human starts a five-second countdown, with bots filling empty slots at
  its end. Rounds last at most two minutes. Empty rooms do not run bots.
  Active rounds continue
  after a disconnect, without promoting spectators mid-round.
  First to five wins early; timeout chooses the highest score, with ties a draw.
  Results stop gameplay for six seconds, then reset into the next countdown.
  Joined and disconnected players cannot erase a declared win/name.
- Late arrivals spectate in a FIFO queue. Up to five drivers race within a
  64-connection room. Existing spectators take next-round slots before returning
  drivers. Names are randomly assigned, unique within the room, and win totals
  persist across rounds only while connected. No identity/database persistence.

Canvas presentation distinguishes gold cores, white shots, health bars and blue
spawn-protection rings. DOM progress bars and standings expose the objective;
the live status announces health/inventory/lifecycle changes, not every frame
or countdown tick. The HUD overlays the arena grid, with timer/round/score
across the top and name/power-ups/health across the bottom.
Prediction remains future work.

## Milestone 4: power-ups and scarcer goals

The authoritative session owns a separate expiring power-up map and publishes
pickup kinds and per-player effect durations/readiness through Colyseus. Client
inputs cannot claim effects or damage. Pickups reuse the same swept collection
and contest ordering as cores and spawn away from cars and other pickups.

- One starting pickup per kind, with a maximum of three. Random replenishment
  attempts every 5-8 seconds; random uncollected lifetime of 12-18 seconds.
- Shield: eight-second bullet/disruption immunity, without restricting firing.
- Speed: eight-second 1.6x engine thrust, using the existing shared tyre model.
  Grip, braking controls and baseline solo handling are unchanged.
- Disruptor: one stored charge consumed on the next unblocked gun hit, applying
  normal damage plus a one-core drop. Misses and blocked hits retain the charge.
  An empty target consumes it without generating a core. Lethal hits still
  drop the entire inventory, with no duplication.
- Recollection refreshes durations, never stacks multipliers or charges.
  Different effects coexist; destruction and round reset remove all effects.
- Gold hexagons remain goal items. Power-ups have outlined square silhouettes:
  cyan ring/shield, lime chevrons/speed, purple pulse/disruption. The HUD exposes
  active effects and timers in text; live announcements only react to effect
  activation/expiry, never every timer tick.

No new dependencies or general-purpose effect framework are required.

Red-X power-downs can appear during random replenishment and share the pickup
cap, expiry and swept collection logic. They apply exactly one health damage
once; shields and spawn protection block it, but still consume the pickup.
Bots do not deliberately seek harmful pickups.

New car-to-car contacts apply one health damage to the target of the greater
pre-impact approach velocity along the line between cars. Equal head-on
impacts have no unique attacker and do not damage either car. Sustained contact
does not repeat damage; separating and hitting again does. Shields and spawn
protection block collision damage, and lethal hits use normal destruction,
core drops and respawn. Walls remain non-damaging.

## Mobile presentation

Phaser resizes to the available canvas. Desktop scales a full-arena camera;
mobile drivers use a bounded, car-following camera and a small overview minimap.
Spectators see the full arena. Camera differences are presentation only.
Touch steering, throttle/reverse, fire and handbrake feed the same validated
input as the keyboard, with independent pointer capture for simultaneous touches.
Cancellation, blur, hidden tabs and gameplay eligibility clear touch input.
Mobile instructions/standings collapse into a native details element, while
safe-area padding and dynamic viewport height keep the arena usable in portrait
and landscape. Pinch zoom is not disabled.

## Server-controlled bots

At countdown completion, the server fills remaining driver slots to five with
clearly named bots. Countdown arrivals take human slots first; active-round
arrivals queue until the next round. Round preparation removes bots, promotes
humans FIFO ahead of returning drivers, then refills unused slots after countdown.
The last human connection leaving clears the world and bots.
The first driver spawns randomly with a 100-pixel arena margin; subsequent
spawns remain separated from occupied car positions.

Bots generate bounded driving/fire controls on the server, seeking nearby cores
or pickups, firing at aligned opponents and periodically reversing when stalled.
They cannot teleport, bypass collision physics or claim pickups/damage; all
effects, destruction, respawn and scoring share the human gameplay paths.
This is simple arcade AI, not sophisticated pathfinding or difficulty scaling.
Relaxed bots use 45% forward throttle and pursue cores throughout the round,
without opening roaming, scheduled pauses or a chase time limit.
Short firing bursts and imperfect aiming give humans room to compete.
Core chase targets use a reproducible per-bot/core/cycle offset of 15-65 pixels
in one of four directions, bounded inside the arena. Keeping the offset stable
within a chase avoids frame-to-frame jitter; offsets beyond the collection
radius make missed pickups possible without changing pickup rules.
The schema publishes a bot marker so clients can distinguish driver counts and
standings. Human-only regression fixtures isolate existing combat tests;
bot tests exercise the real automatic filling and driving behavior.
