# Car Arena

## Neon Scrapyard

Rules, driving controls, pickup explanations and standings live in a pregame
menu. Join an existing lobby or create one with 1-10 driver slots and AI enabled
or disabled. **Play** begins the solo playground; loading the page alone does
not enter a race. **Game menu** reopens the menu during play without leaving
or pausing the online round. Its button sits at the bottom-left of the arena,
with the event feed above it. **Back to game** resumes play; **Back to main menu**
reloads the client, leaving the current lobby and returning to the lobby picker
(or the start screen in solo mode).

Driver names, health bars and core progress appear above the cars. A bounded bottom-left arena event feed shows
round changes, core collection/loss, wrecks, respawns and power-up changes.
Messages move upward and fade over seven seconds; reduced motion removes the
scroll animation. Central local-damage warnings use a bold impact stamp with a
short scale/rotation bounce, the existing small camera shake, and a fade-out.
Repeated hits restart the entrance; reduced motion removes the bounce and shake.
Losing all health replaces the hit warning with **You've been scrapped** while
the normal respawn countdown continues.

The game now has an after-dark salvage-yard theme: textured asphalt, oil stains,
cracks, faded road markings, hazard-striped barriers and cyan/violet yard lights.
Armoured car details, gold-core halos, outlined power-up icons, neon tracers and
small pickup/impact sparks bring the arena to life. A narrower nose/front bumper
makes car direction easier to read without changing the rectangular collision
body or handling. Original retro top-down cars have distinct bonnets, roofs,
windows and boots. A tiny driver leans out of the side window during visible
shots, with a brief muzzle flash (disabled for reduced motion), replacing the
bonnet gun. Projectile paths and firing behaviour are unchanged.
Cars have stable ID-based paint colours shared across browsers; your car retains
a mint outline and "You" label. Faint warm-white headlight beams fade ahead of
each car and follow its heading, without flashing or affecting gameplay.
The compact HUD sits inside
the arena edges with a 20px desktop / 16px mobile inset and fine borders, with
health shown as a bar.

Desktop play fits the arena to the viewport at its original 8:5 aspect ratio:
full width when height allows, otherwise height-limited and centered on both
axes. Container resizes immediately refresh the canvas and camera without
restarting the round. The desktop camera trims the outer wall edges for slimmer
concrete borders, without hiding playable space or changing collisions.
Mobile retains its full-height, car-following view and original walls.
Errors appear in a modal alert with a **Continue** button (or Escape to dismiss),
not below the game. Dismissal clears the message and returns focus to the game
or lobby picker; failed joins can be retried without reloading.

Scenery is decorative: no new obstacles or physics/balance changes. All artwork
is generated locally with Phaser, with the detailed floor baked once into a
texture and particles capped at 120. Reduced motion disables sparks and pickup
pulsing, as well as damage shake.

The supplied `src/assets/gameloop.mp3` loops during play, once the browser
unlocks audio through interaction. `src/assets/menu.mp3` loops in the lobby,
help and game menus; switching menus pauses/resumes the appropriate track
without playing both at once. Initial menu music needs a user interaction
on browsers that block autoplay. `src/assets/gun.mp3` plays for newly observed
nearby shots, fading with distance. The menu's Sound button mutes both music
and effects. `src/assets/explode.mp3` plays once when a previously alive car is
wrecked, fading with distance rather than replaying during its respawn countdown.
Car-to-car contact starts randomly play `bash1.mp3` or `bash2.mp3`, including
protected impacts; continuous contact and wall collisions do not trigger them.
Wall contact starts play `thud.mp3`, including in solo practice. Holding against
a wall does not repeat the sound, and walls still cause no damage.
Each effect gets subtle random playback-rate variation: gunshots +/-4%,
bashes/thuds +/-6%, explosions +/-3%. Music pitch and playback rate stay unchanged.
Power-up collections play `collect.mp3`; gold core collections play `pickup.mp3`.
Both fade with distance, respect sound mute and vary playback rate by +/-6%.
Refreshing an existing power-up also plays its collection sound.
Your own moving car loops `engine.mp3`, smoothly raising playback rate from
0.8 to 1.6 as speed rises up to 400px/s. It stops when stationary, wrecked or
spectating. Small start/stop thresholds prevent jitter at near-zero speed.
The Sound toggle mutes the engine; music-only mute leaves it audible.
Background tabs are muted. Returning to the lobby picker stops
music, and leaving the page stops playback.
**Mute music** is available in both the main and game menus and pauses only
music, leaving gunshots enabled. **Unmute music** resumes the appropriate track.

A TypeScript multiplayer top-down car-combat and collection game. Phaser renders;
standalone Matter.js runs authoritative physics on a Node.js/Colyseus server.
See [the approach](docs/approach.md) for architecture and roadmap.

## Deploy on Railway

Push the complete project to GitHub and deploy that repository as a Node service.
`railway.json` selects Railpack, `npm run build`, `npm start`, `/health` and one
replica. The Node process serves both the built client and the Colyseus game.
Do not deploy only `dist` as a static site: it cannot handle matchmaking or
WebSocket connections.

Generate a public domain in the service's Networking settings. Railway supplies
`PORT`; no extra environment variables are required. `/health` must return
`{"ok":true}` and `/game/lobbies` must return JSON, not the client HTML.
Remove any old static-site builder or start-command overrides if migrating an
existing service. Keep one replica: lobbies are in memory, and deployments or
restarts disconnect players and reset rounds.

## Local development

Requires Node.js 24 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5197 in two browser tabs/windows, create a lobby in one and
join that lobby in the other. Your car has a mint outline and "You" label;
cars use varied paint colours.

`npm run dev` starts both the game server (port 2567) and Vite (port 5197).
Vite proxies `/game` HTTP and WebSocket traffic to the game server, so browsers
only need the webpage URL. To change the server port, set `GAME_PORT` for both
processes. `npm run dev:client -- --host 0.0.0.0` can expose the webpage on a
trusted LAN while `npm run dev:server` runs separately on the same machine.
This is a local prototype, not a hardened public deployment.

- W / Up: accelerate.
- S / Down: brake by applying reverse thrust, then reverse.
- A / D or Left / Right: steer and accelerate. S / Down takes priority for reversing.
- H: open help. M: open the game menu while driving.
- Forward and reverse thrust are tuned another 25% lower after the initial 15%
  reduction (36.25% below the original tuning) for gentler driving for humans
  and bots; steering/grip and relative speed-boost strength are unchanged.
- F / Space: hold to fire the forward-facing gun.
- Manual respawn/reset controls are removed. Wrecks still respawn automatically
  after three seconds with dropped cores.

## Core Run rules

- Drive over glowing **gold hexagons** to collect goal items called cores.
  **First to hold five at once wins the round.** No delivery zone is required.
- Cores appear at random positions and vanish after 8-15 seconds. A round
  starts with three; new cores are attempted every 0.5-2 seconds up to five
  on the ground. Inventory drops may temporarily exceed this cap.
- The first human starts a five-second countdown. Humans joining during
  countdown take available slots; when it ends, bots fill the race to five cars.
  An empty room waits without bots or gameplay.
- The first car starts at a random position safely inside the walls. Following
  cars use unoccupied spawn positions at least 100 pixels from existing cars.
  Rounds have a two-minute time limit.
  At timeout, the highest carried score wins; equal top scores draw.
- Arrivals after the countdown spectate in a FIFO queue. Up to five drivers
  race, with up to 64 connections per room. Queued spectators get the next
  available slots before returning drivers.
- Bots are relaxed opponents: reduced acceleration and continuous core pursuit
  from the start, without roaming, scheduled pauses or a chase time limit.
  They fire in short bursts.
  They look ahead and steer away from walls. A full second without 24 pixels of
  progress at low speed triggers 1.25 seconds of reversing, then two seconds
  steering toward open space. Moving bots have no scheduled reversals or pauses.
  They use the same physics, damage, respawns
  and five-core win rules as humans.
  Core aiming is deliberately imperfect: each chase uses a stable target
  15-65 pixels left, right, above or below the core, so bots can miss pickups.
  Bots are marked in standings and the driver count. They never take human queue
  priority; each new round removes old bots and fills only remaining slots.
  Mid-round arrivals do not replace bots until the next round. Removing the
  last human connection clears the arena rather than running bot-only rounds.
- Each car has 100 health. The gun deals 25 damage per hit, fires at most four
  times per second and shoots where the car faces. Bullets stop at cars/walls;
  the shooter cannot hit itself. A new car-to-car collision deals 1 health
  damage to the car hit by the stronger incoming motion. Equal head-on impacts
  have no unique attacker and cause no damage. Continuous contact does not
  repeat damage; shields and spawn protection block it. Walls cause no damage.
- At zero health the car is removed from collision physics and drops all its
  cores around the wreck. Dropped cores become collectible after 0.75 seconds.
  Disconnecting also drops carried cores during an active round.
- Respawn takes three seconds and restores 100 health, zero cores and cleared
  controls at an unoccupied spawn. If pads are blocked, the car waits until one
  clears. New/respawned cars have two seconds of protection: they cannot take
  bullet damage or fire. The blue ring indicates this protection, not a shield
  power-up.
- A result freezes collection/combat/movement for a six-second results display,
  then a fresh countdown resets cars, health, cores, power-ups and projectiles.
  A simultaneous pickup is awarded once, by distance then player ID.
- The HUD overlays the arena grid: timer top-left, driver/bot/spectator counts top-middle,
  your score/wins top-right, your randomly assigned name bottom-left,
  active power-ups bottom-middle and health bottom-right.
  Names and total wins last while connected, across rounds; reload loses them.
- Taking damage briefly flashes a translucent reason in the centre of your
  arena (bullet, car collision or power-down), then fades after 1.3 seconds.
  A subtle 180ms camera shake accompanies it; reduced-motion preferences
  disable the shake, and the HUD remains stationary.
  Blocked damage and manual respawn do not trigger the flash.

## Power-ups

Power-ups are **outlined square pickups**, distinct from gold goal hexagons.
Drive over one to activate it; no extra key is required. The round starts with
one of each kind, with up to three available at once. New pickups are attempted
every 5-8 seconds, and uncollected pickups expire after 12-18 seconds.

- **Shield** (cyan ring): eight seconds of bullet immunity, including core
  disruption. Unlike the thin blue spawn-protection ring, this shield allows
  firing.
- **Speed boost** (lime chevrons): eight seconds of 1.6x forward/reverse engine
  thrust, increasing acceleration and attainable speed without changing grip.
- **Disruptor** (purple pulse): charges the next unblocked gun hit. Alongside
  normal damage, it drops one of the target's carried cores. Anyone can collect
  it after the usual 0.75-second grace period. Misses and shield/spawn-protected
  hits retain the charge; an unblocked hit on an empty target consumes it but
  creates no core.
- **Power-down** (red X): a harmful pickup that removes exactly 1 health
  once, then disappears, even if blocked by shield/spawn protection. At
  1 health it causes normal destruction, core drops and respawn. It can appear
  during random replenishment, sharing the three-pickup limit and expiry rules.

Timed effects refresh, rather than stack, on repeat collection. Only one
disruption charge can be held. Different kinds work together. All effects
clear on destruction, manual respawn, disconnect or a new round. The HUD
shows remaining durations/charge readiness; cars show a cyan shield ring,
lime boost trail and purple charged muzzle.

Speed is shown in pixels per second.
Use http://127.0.0.1:5197/?solo=1 for the original offline single-car playground.
Multiplayer never silently falls back to solo when the server fails.

## Mobile play

Phones and touch screens use a compact layout with instructions/standings in
an expandable "How to play" section. The camera follows your car at a readable
scale; a minimap shows cars, cores, pickups and the visible camera area.
Spectators retain the whole-arena overview. Desktop retains its full-arena view.
On mobile, power-up status and health sit beneath the direction pad and FIRE
button; the timer and score remain at the top.
Desktop also shows FIRE above the health panel; hold it with the mouse or use F.
FIRE remains visible but disabled in solo driving practice, which has no weapons.

Touch anywhere on the larger left direction pad to set its centre, then slide
towards the screen direction you want to drive. Up means screen-up and down
means screen-down, regardless of the car's heading. The car steers smoothly
towards that direction with reduced acceleration during sharp turns.
A 6px dead zone coasts; displacement increases throttle up to 48px.
Release to coast. When nearly stopped and pointing behind the car, the stick
automatically backs up towards that direction so a wall cannot pin the nose.
Backing up continues until you release/centre the stick or point ahead again.
Keyboard driving remains car-relative. There are no
separate GO/REV or DRIFT buttons. Hold FIRE for the gun alongside the direction
pad. Hard forward turns automatically reduce rear grip gradually above
180 px/s, reaching the full subtle effect at 360 px/s with full steering.
Gentle turns, slow driving, coasting and reversing retain normal grip.
Straightening up restores grip immediately. Space fires alongside F; there is
no manual keyboard handbrake. Automatic drift does not apply extra braking.
Multiple touches work together.
Releasing/cancelling a touch, leaving the tab or losing window focus clears
held controls. Controls are disabled while waiting, counting down, respawning
or spectating. Both portrait and landscape work without changing the shared
world or physics. Browser zoom remains available; dynamic viewport sizing and
safe-area padding accommodate browser bars and notches.

The server runs at 60 Hz and publishes state at 20 Hz. Browsers smooth received
positions; local prediction is not implemented yet, so network latency is
noticeable. Inputs expire after 500 ms without refresh. Disconnects remove
the car and display an error; reload to join again. Respawn chooses an unoccupied
spawn point, which may differ from the original spawn. Reloading the page rejoins
as a new player, without carried progress.

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser tests start dedicated game (2677) and Vite (5297) servers; they do
not reuse unrelated running apps. Tests include two independent browser
contexts, remote movement, state convergence, ramming, leaving,
connection loss, failed joins, collecting cores, remote damage, destruction,
core drops, respawn and a replicated shield pickup/expiry. Unit tests verify
exactly-five wins, the exact two-minute cutoff, queue rotation, random expiry,
scarce-core limits, contested collection, fire rate, protection, swept hits
and all three power-up effects, stacking rules and lifecycle cleanup.
Physics and server-session tests run without Phaser or a browser.

`npm run build` produces the browser assets in `dist`. For deployment, run a
long-lived server with `npm run start:server` and serve `dist` behind a reverse
proxy that forwards `/game` (including WebSocket upgrades) to that server.
HTTPS requires WSS. The Vite development proxy is not included in the build.

## Layout

- `src/shared/simulation.ts`: fixed-step world and tyre-force controller.
- `src/shared/state.ts`: shared Colyseus state schema.
- `src/shared/game.ts`: game rules and snapshot types.
- `src/shared/geometry.ts`: swept bullet/car hits and core pickup distances.
- `src/server/`: authoritative rounds, combat, input expiry and safe spawning.
- `src/client/`: Phaser presentation, keyboard input and DOM UI.
- `tests/`: browser acceptance tests.

Handling values are collected in `HANDLING` in the shared simulation. Artwork
is generated from geometric primitives; no downloaded assets are used.

## Milestone history

1. Single-car driving, steering, reverse, handbrake, walls and reset, committed
   before multiplayer.
2. Shared authoritative driving arena with up to eight players, explicit
   connection errors and browser acceptance tests.
3. Core Run: five-core objective, basic gun, health, destruction, core drops,
   protected respawns, timed rounds, queued spectators, names, win totals
   and automatic round restart.
4. Separate shield, speed-boost and core-disruption pickups.

Next: balancing, more weapons and prediction.
