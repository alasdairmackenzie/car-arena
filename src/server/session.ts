import { ARENA, idleInput, isCarInput, Simulation, STEP_MS, type CarInput, type CarSnapshot } from '../shared/simulation';
import { POWER_UP_KINDS, RULES, type CoreSnapshot, type GameSnapshot, type PlayerSnapshot, type PowerUpKind, type PowerUpSnapshot, type ProjectileSnapshot, type RoundPhase } from '../shared/game';
import { distanceToSegment, segmentCarHit } from '../shared/geometry';
import { botInput, type BotMemory } from './bot';
import Matter from 'matter-js';
import { lobbySettings, type LobbySettings } from '../shared/lobby';

export const INPUT_TIMEOUT_MS = 500;
/** Default driver slots for a lobby created without options. */
export const MAX_PLAYERS = RULES.maxDrivers;
export const MAX_CONNECTIONS = 64;

const spawns = [
  { x: 720, y: 450 },
  { x: 720, y: 300 },
  ...[300, 600].flatMap(y => [320, 480, 640, 800, 960, 1120].map(x => ({ x, y }))),
];

interface Player {
  bot: boolean;
  botMemory?: BotMemory;
  damageSequence: number;
  collisionSequence: number;
  wallCollisionSequence: number;
  corePickupSequence: number;
  powerUpPickupSequence: number;
  damageReason: string;
  health: number;
  cores: number;
  respawnAt: number;
  protectedUntil: number;
  nextShotAt: number;
  lastInputAt: number;
  input: CarInput;
  pose: CarSnapshot;
  spectator: boolean;
  name: string;
  wins: number;
  shieldUntil: number;
  boostUntil: number;
  disruptor: boolean;
}

interface Core extends CoreSnapshot {
  collectAt: number;
  expiresAt: number;
}

interface Projectile extends ProjectileSnapshot {
  expiresAt: number;
}

interface PowerUp extends PowerUpSnapshot {
  expiresAt: number;
}

export class ArenaSession {
  readonly simulation = new Simulation();
  readonly players = new Map<string, Player>();
  readonly cores = new Map<string, Core>();
  readonly projectiles = new Map<string, Projectile>();
  readonly powerUps = new Map<string, PowerUp>();
  private readonly queue: string[] = [];
  private nextId = 0;
  private phaseEndsAt = 0;
  private nextCoreAt = 0;
  private nextPowerUpAt = 0;
  private contacts = new Set<string>();
  winner = '';
  winnerName = '';
  result = '';
  phase: RoundPhase = 'waiting';
  round = 1;
  tick = 0;

  readonly settings: LobbySettings;

  constructor(private readonly random: () => number = Math.random, settings: Partial<LobbySettings> = {}) {
    this.settings = lobbySettings(settings);
  }

  join(id: string): void {
    if ([...this.players.values()].filter(player => !player.bot).length >= MAX_CONNECTIONS) throw new Error('Room is full');
    if (this.players.has(id)) throw new Error(`Player already exists: ${id}`);
    this.players.set(id, {
      bot: false, damageSequence: 0, collisionSequence: 0, wallCollisionSequence: 0, damageReason: '', health: 0, cores: 0, respawnAt: 0,
      corePickupSequence: 0, powerUpPickupSequence: 0,
      protectedUntil: 0, nextShotAt: 0,
      lastInputAt: this.tick, input: idleInput(),
      pose: { id, x: 0, y: 0, angle: -Math.PI / 2, speed: 0, steering: 0 },
      spectator: true, name: this.assignName(), wins: 0,
      shieldUntil: 0, boostUntil: 0, disruptor: false,
    });
    this.queue.push(id);
    if (this.phase === 'waiting' || this.phase === 'countdown') {
      this.fillDriverSlots();
      this.updateLobbyPhase();
    }
  }

  leave(id: string): void {
    const player = this.requirePlayer(id);
    if (this.phase === 'active') this.dropCores(player);
    if (this.simulation.cars.has(id)) this.simulation.removeCar(id);
    this.players.delete(id);
    const position = this.queue.indexOf(id);
    if (position >= 0) this.queue.splice(position, 1);
    for (const [key, bullet] of this.projectiles) {
      if (bullet.owner === id) this.projectiles.delete(key);
    }
    if (![...this.players.values()].some(other => !other.bot)) {
      this.removeBots();
      this.prepareRound();
      return;
    }
    if (this.phase === 'waiting' || this.phase === 'countdown') {
      this.fillDriverSlots();
      this.updateLobbyPhase();
    } else if (this.phase === 'active' && !this.driverCount()) {
      this.finishRound();
    }
  }

  input(id: string, input: CarInput): void {
    if (!isCarInput(input)) throw new Error('Invalid car input');
    const player = this.requirePlayer(id);
    player.input = this.phase === 'active' && !player.spectator ? { ...input } : idleInput();
    player.lastInputAt = this.tick;
  }

  reset(id: string): string {
    const player = this.requirePlayer(id);
    if (player.spectator) return 'Spectating. You are queued for a future round.';
    if (this.phase !== 'active') return 'Wait for the round to start.';
    if (player.health === 0) return 'Already respawning.';
    this.destroy(id, player);
    return 'Respawning in 3 seconds. All carried cores dropped.';
  }

  step(): void {
    this.tick++;
    if (this.phase === 'waiting') return;
    if (this.phase === 'results') {
      if (this.tick >= this.phaseEndsAt) {
        this.round++;
        this.prepareRound();
      }
      return;
    }
    if (this.phase === 'countdown') {
      if (this.tick >= this.phaseEndsAt) this.beginRound();
      return;
    }
    if (this.tick >= this.phaseEndsAt) {
      this.finishRound();
      return;
    }
    const botGame = this.snapshot();
    for (const [id, player] of this.players) {
      if (player.spectator) continue;
      if (player.health === 0) {
        if (this.tick >= player.respawnAt) this.respawn(id, player);
        continue;
      }
      if (player.bot) {
        player.botMemory ??= {};
        player.input = botInput(botGame.players.find(other => other.id === id)!, botGame, this.tick, player.botMemory);
      }
      else if ((this.tick - player.lastInputAt) * STEP_MS >= INPUT_TIMEOUT_MS) player.input = idleInput();
      this.simulation.setInput(id, player.input);
      this.simulation.setEngineMultiplier(id, this.tick < player.boostUntil ? RULES.boostMultiplier : 1);
    }
    const before = new Map(this.simulation.snapshot().map(car => [car.id, car]));
    const velocities = new Map([...this.simulation.cars].map(([id, car]) => [id, Matter.Body.getVelocity(car.body)]));
    this.simulation.step();
    const after = this.simulation.snapshot();
    for (const car of after) this.requirePlayer(car.id).pose = car;
    this.damageCollisions(before, velocities);
    for (const car of after) {
      const player = this.requirePlayer(car.id);
      if (player.health > 0 && player.input.fire && this.tick >= player.nextShotAt && this.tick >= player.protectedUntil) {
        this.fire(car);
        player.nextShotAt = this.tick + RULES.shotCooldownTicks;
      }
    }
    this.advanceProjectiles(before);
    this.updateCores();
    this.collectCores(before);
    if (this.phase === 'active') {
      this.updatePowerUps();
      this.collectPowerUps(before);
    }
  }

  snapshot(): GameSnapshot {
    return {
      players: [...this.players].map(([id, player]): PlayerSnapshot => ({
        ...player.pose, id, health: player.health, cores: player.cores,
        bot: player.bot,
        damageSequence: player.damageSequence, collisionSequence: player.collisionSequence, wallCollisionSequence: player.wallCollisionSequence, damageReason: player.damageReason,
        corePickupSequence: player.corePickupSequence, powerUpPickupSequence: player.powerUpPickupSequence,
        alive: player.health > 0,
        respawnTicks: player.health === 0 ? Math.max(0, player.respawnAt - this.tick) : 0,
        protectionTicks: Math.max(0, player.protectedUntil - this.tick),
        spectator: player.spectator,
        queuePosition: this.queue.indexOf(id) + 1,
        name: player.name, wins: player.wins,
        shieldTicks: Math.max(0, player.shieldUntil - this.tick),
        boostTicks: Math.max(0, player.boostUntil - this.tick),
        disruptor: player.disruptor,
      })),
      cores: [...this.cores.values()].map(({ id, x, y }) => ({ id, x, y })),
      powerUps: [...this.powerUps.values()].map(({ id, x, y, kind }) => ({ id, x, y, kind })),
      projectiles: [...this.projectiles.values()].map(({ id, x, y, owner, angle }) => ({ id, x, y, owner, angle })),
      winner: this.winner, round: this.round,
      restartTicks: this.phase === 'results' ? Math.max(0, this.phaseEndsAt - this.tick) : 0,
      phase: this.phase, phaseTicks: Math.max(0, this.phaseEndsAt - this.tick),
      winnerName: this.winnerName, result: this.result,
      lobbyName: this.settings.name, maxDrivers: this.settings.maxDrivers, botsEnabled: this.settings.bots,
    };
  }

  private requirePlayer(id: string): Player {
    const player = this.players.get(id);
    if (!player) throw new Error(`Unknown player: ${id}`);
    return player;
  }

  private damageCollisions(before: Map<string, CarSnapshot>, velocities: Map<string, Matter.Vector>): void {
    const ids = new Map([...this.simulation.cars].map(([id, car]) => [car.body.id, id]));
    const contacts = new Set<string>();
    for (const pair of this.simulation.engine.pairs.list) {
      if (!pair.isActive) continue;
      const a = ids.get(pair.bodyA.id);
      const b = ids.get(pair.bodyB.id);
      if (!a && !b) continue;
      contacts.add(pair.id);
      if (this.contacts.has(pair.id)) continue;
      if (!a || !b) {
        this.requirePlayer((a ?? b)!).wallCollisionSequence++;
        continue;
      }
      this.requirePlayer(a).collisionSequence++;
      const one = before.get(a);
      const two = before.get(b);
      const va = velocities.get(a);
      const vb = velocities.get(b);
      if (!one || !two || !va || !vb) continue;
      const distance = Math.hypot(two.x - one.x, two.y - one.y);
      if (distance === 0) continue;
      const dx = (two.x - one.x) / distance;
      const dy = (two.y - one.y) / distance;
      const approachA = Math.max(0, va.x * dx + va.y * dy);
      const approachB = Math.max(0, -vb.x * dx - vb.y * dy);
      // Equal head-on impacts have no unique attacker.
      if (Math.abs(approachA - approachB) < 0.01) continue;
      this.damagePlayer(approachA > approachB ? b : a, RULES.collisionDamage, 'Hit by another car');
    }
    this.contacts = contacts;
  }

  private damagePlayer(id: string, amount: number, reason: string): void {
    const player = this.requirePlayer(id);
    if (player.health === 0 || this.tick < player.shieldUntil || this.tick < player.protectedUntil) return;
    player.health = Math.max(0, player.health - amount);
    player.damageSequence++;
    player.damageReason = reason;
    if (player.health === 0) this.destroy(id, player);
  }

  private availableSpawn(excludeId?: string): { x: number; y: number } | undefined {
    const cars = this.simulation.snapshot().filter(car => car.id !== excludeId);
    if (!cars.length) return this.firstSpawn();
    return spawns.find(point =>
      cars.every(car => Math.hypot(car.x - point.x, car.y - point.y) > 100));
  }

  protected firstSpawn(): { x: number; y: number } {
    return {
      x: 100 + this.random() * (ARENA.width - 200),
      y: 100 + this.random() * (ARENA.height - 200),
    };
  }

  private respawn(id: string, player: Player): void {
    const spawn = this.availableSpawn();
    // Blocked pads are a gameplay wait, not a reason to overlap another car.
    if (!spawn) return;
    this.simulation.addCar(id, spawn.x, spawn.y);
    player.health = RULES.health;
    player.respawnAt = 0;
    player.protectedUntil = this.tick + RULES.protectionTicks;
    player.input = idleInput();
    player.botMemory = undefined;
    player.pose = { id, ...spawn, angle: -Math.PI / 2, speed: 0, steering: 0 };
  }

  private randomTicks(min: number, max: number): number {
    return min + Math.floor(this.random() * (max - min + 1));
  }

  private addCore(point: { x: number; y: number }, collectAt = this.tick): void {
    const id = `core-${this.nextId++}`;
    this.cores.set(id, {
      id, ...point, collectAt,
      expiresAt: this.tick + this.randomTicks(RULES.coreLifetimeMinTicks, RULES.coreLifetimeMaxTicks),
    });
  }

  private randomPickupPosition(): { x: number; y: number } | undefined {
    for (let attempt = 0; attempt < 40; attempt++) {
      const point = {
        x: 80 + this.random() * (ARENA.width - 160),
        y: 80 + this.random() * (ARENA.height - 160),
      };
      if ([...this.cores.values()].some(core => Math.hypot(core.x - point.x, core.y - point.y) < 70)) continue;
      if ([...this.powerUps.values()].some(pickup => Math.hypot(pickup.x - point.x, pickup.y - point.y) < 70)) continue;
      if (this.simulation.snapshot().some(car => Math.hypot(car.x - point.x, car.y - point.y) < 70)) continue;
      return point;
    }
    // Crowded areas skip this spawn attempt; the next scheduled attempt retries.
  }

  private spawnRandomCore(): void {
    const point = this.randomPickupPosition();
    if (point) this.addCore(point);
  }

  private spawnPowerUp(kind: PowerUpKind): void {
    const point = this.randomPickupPosition();
    if (!point) return;
    const id = `power-${this.nextId++}`;
    this.powerUps.set(id, {
      id, ...point, kind,
      expiresAt: this.tick + this.randomTicks(RULES.powerUpLifetimeMinTicks, RULES.powerUpLifetimeMaxTicks),
    });
  }

  private updatePowerUps(): void {
    for (const [id, pickup] of this.powerUps) {
      if (this.tick >= pickup.expiresAt) this.powerUps.delete(id);
    }
    if (this.tick >= this.nextPowerUpAt) {
      if (this.powerUps.size < RULES.maxPowerUps) {
        this.spawnPowerUp(POWER_UP_KINDS[Math.floor(this.random() * POWER_UP_KINDS.length)]);
      }
      this.nextPowerUpAt = this.tick + this.randomTicks(RULES.powerUpSpawnMinTicks, RULES.powerUpSpawnMaxTicks);
    }
  }

  private pickupCollector(point: CoreSnapshot, before: Map<string, CarSnapshot>): [string, Player] | undefined {
    const candidates = [...this.players].filter(([key, player]) =>
      !player.spectator && player.health > 0 && distanceToSegment(point, before.get(key) ?? player.pose, player.pose) <= RULES.pickupRadius);
    candidates.sort(([a, one], [b, two]) =>
      Math.hypot(point.x - one.pose.x, point.y - one.pose.y) -
      Math.hypot(point.x - two.pose.x, point.y - two.pose.y) || a.localeCompare(b));
    return candidates[0];
  }

  private collectPowerUps(before: Map<string, CarSnapshot>): void {
    for (const [id, pickup] of this.powerUps) {
      const collector = this.pickupCollector(pickup, before);
      if (!collector) continue;
      const player = collector[1];
      if (pickup.kind === 'shield') player.shieldUntil = this.tick + RULES.shieldTicks;
      else if (pickup.kind === 'speed') player.boostUntil = this.tick + RULES.boostTicks;
      else if (pickup.kind === 'disruptor') player.disruptor = true;
      else this.damagePlayer(collector[0], RULES.powerDownDamage, 'Picked up a power-down');
      this.powerUps.delete(id);
      player.powerUpPickupSequence++;
    }
  }

  private updateCores(): void {
    for (const [id, core] of this.cores) {
      if (this.tick >= core.expiresAt) this.cores.delete(id);
    }
    if (this.tick >= this.nextCoreAt) {
      if (this.cores.size < RULES.maxCores) this.spawnRandomCore();
      this.nextCoreAt = this.tick + this.randomTicks(RULES.coreSpawnMinTicks, RULES.coreSpawnMaxTicks);
    }
  }

  private collectCores(before: Map<string, CarSnapshot>): void {
    for (const [id, core] of this.cores) {
      if (this.tick < core.collectAt) continue;
      const collector = this.pickupCollector(core, before);
      if (!collector) continue;
      const [playerId, player] = collector;
      player.cores++;
      player.corePickupSequence++;
      this.cores.delete(id);
      if (player.cores === RULES.goal) {
        this.finishRound(playerId);
        return;
      }
    }
  }

  private fire(car: CarSnapshot): void {
    const id = `shot-${this.nextId++}`;
    this.projectiles.set(id, {
      id, owner: car.id, angle: car.angle,
      x: car.x + Math.cos(car.angle) * 36,
      y: car.y + Math.sin(car.angle) * 36,
      expiresAt: this.tick + RULES.bulletLifetimeTicks,
    });
  }

  private advanceProjectiles(before: Map<string, CarSnapshot>): void {
    const { wall, width, height } = ARENA;
    for (const [id, bullet] of this.projectiles) {
      if (this.tick >= bullet.expiresAt) {
        this.projectiles.delete(id);
        continue;
      }
      const end = {
        x: bullet.x + Math.cos(bullet.angle) * RULES.bulletSpeed / 60,
        y: bullet.y + Math.sin(bullet.angle) * RULES.bulletSpeed / 60,
      };
      let wallAt = 1;
      for (const [origin, next, min, max] of [
        [bullet.x, end.x, wall, width - wall],
        [bullet.y, end.y, wall, height - wall],
      ]) {
        if (origin < min || origin > max) wallAt = 0;
        else if (next < min) wallAt = Math.min(wallAt, (min - origin) / (next - origin));
        else if (next > max) wallAt = Math.min(wallAt, (max - origin) / (next - origin));
      }
      let hitId = '';
      let hitAt = wallAt;
      for (const [playerId, player] of this.players) {
        if (playerId === bullet.owner || player.health === 0) continue;
        const fraction = segmentCarHit(bullet, end, before.get(playerId) ?? player.pose, player.pose);
        if (fraction !== undefined && fraction <= hitAt) {
          hitAt = fraction;
          hitId = playerId;
        }
      }
      if (hitId) {
        const target = this.requirePlayer(hitId);
        if (this.tick >= target.protectedUntil && this.tick >= target.shieldUntil) {
          const shooter = this.requirePlayer(bullet.owner);
          if (shooter.disruptor) {
            shooter.disruptor = false;
            this.dropCores(target, 1);
          }
          this.damagePlayer(hitId, RULES.damage, 'Hit by a bullet');
        }
        this.projectiles.delete(id);
      } else if (wallAt < 1) {
        this.projectiles.delete(id);
      } else {
        bullet.x = end.x;
        bullet.y = end.y;
      }
    }
  }

  private destroy(id: string, player: Player): void {
    this.dropCores(player);
    this.simulation.removeCar(id);
    player.health = 0;
    player.input = idleInput();
    player.pose = { ...player.pose, speed: 0, steering: 0 };
    player.respawnAt = this.tick + RULES.respawnTicks;
    player.protectedUntil = 0;
    player.shieldUntil = 0;
    player.boostUntil = 0;
    player.disruptor = false;
  }

  private dropCores(player: Player, limit = player.cores): void {
    const count = Math.min(player.cores, limit);
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count;
      this.addCore({
        x: Math.max(ARENA.wall + 16, Math.min(ARENA.width - ARENA.wall - 16, player.pose.x + Math.cos(angle) * 45)),
        y: Math.max(ARENA.wall + 16, Math.min(ARENA.height - ARENA.wall - 16, player.pose.y + Math.sin(angle) * 45)),
      }, this.tick + RULES.dropGraceTicks);
    }
    player.cores -= count;
  }

  private driverCount(): number {
    return [...this.players.values()].filter(player => !player.spectator).length;
  }

  private updateLobbyPhase(): void {
    if (this.driverCount() < RULES.minDrivers) {
      this.phase = 'waiting';
      this.phaseEndsAt = 0;
    } else if (this.phase !== 'countdown') {
      this.phase = 'countdown';
      this.phaseEndsAt = this.tick + RULES.countdownTicks;
    }
  }

  private fillDriverSlots(): void {
    while (this.queue.length && this.driverCount() < this.settings.maxDrivers) {
      const id = this.queue.shift()!;
      const player = this.requirePlayer(id);
      player.spectator = false;
      this.respawn(id, player);
    }
  }

  private prepareRound(): void {
    this.removeBots();
    for (const id of this.simulation.cars.keys()) this.simulation.removeCar(id);
    this.cores.clear();
    this.projectiles.clear();
    this.powerUps.clear();
    this.contacts.clear();
    this.winner = '';
    this.winnerName = '';
    this.result = '';
    for (const player of this.players.values()) {
      player.spectator = true;
      player.health = 0;
      player.cores = 0;
      player.respawnAt = 0;
      player.protectedUntil = 0;
      player.nextShotAt = 0;
      player.shieldUntil = 0;
      player.boostUntil = 0;
      player.disruptor = false;
      player.lastInputAt = this.tick;
      player.input = idleInput();
    }
    this.fillDriverSlots();
    this.phase = 'waiting';
    this.updateLobbyPhase();
  }

  private beginRound(): void {
    this.fillBotSlots();
    this.phase = 'active';
    this.phaseEndsAt = this.tick + RULES.roundTicks;
    for (const player of this.players.values()) {
      if (player.spectator) continue;
      player.input = idleInput();
      player.lastInputAt = this.tick;
      player.protectedUntil = this.tick + RULES.protectionTicks;
    }
    for (let i = 0; i < RULES.initialCores; i++) this.spawnRandomCore();
    this.nextCoreAt = this.tick + this.randomTicks(RULES.coreSpawnMinTicks, RULES.coreSpawnMaxTicks);
    for (let i = 0; i < RULES.initialPowerUps; i++) this.spawnPowerUp(POWER_UP_KINDS[i % POWER_UP_KINDS.length]);
    this.nextPowerUpAt = this.tick + this.randomTicks(RULES.powerUpSpawnMinTicks, RULES.powerUpSpawnMaxTicks);
  }

  private finishRound(earlyWinner?: string): void {
    const drivers = [...this.players].filter(([, player]) => !player.spectator);
    const highest = Math.max(0, ...drivers.map(([, player]) => player.cores));
    const leaders = drivers.filter(([, player]) => player.cores === highest);
    this.winner = earlyWinner ?? (leaders.length === 1 ? leaders[0][0] : '');
    this.result = earlyWinner ? 'five-cores' : this.winner ? 'timeout' : 'draw';
    if (this.winner) {
      const winner = this.requirePlayer(this.winner);
      winner.wins++;
      this.winnerName = winner.name;
    }
    this.phase = 'results';
    this.phaseEndsAt = this.tick + RULES.restartTicks;
    this.projectiles.clear();
    for (const [id, player] of drivers) {
      player.input = idleInput();
      if (!player.bot) this.queue.push(id);
    }
  }

  protected fillBotSlots(): void {
    if (!this.settings.bots) return;
    while (this.driverCount() < this.settings.maxDrivers) {
      const id = `bot-${this.nextId++}`;
      if (this.players.has(id)) continue;
      this.players.set(id, {
        bot: true, damageSequence: 0, collisionSequence: 0, wallCollisionSequence: 0, damageReason: '', health: 0, cores: 0, respawnAt: 0, protectedUntil: 0,
        corePickupSequence: 0, powerUpPickupSequence: 0,
        nextShotAt: 0, lastInputAt: this.tick, input: idleInput(),
        pose: { id, x: 0, y: 0, angle: -Math.PI / 2, speed: 0, steering: 0 },
        spectator: false, name: `Bot ${id.slice(4)}`, wins: 0,
        shieldUntil: 0, boostUntil: 0, disruptor: false,
      });
      this.respawn(id, this.requirePlayer(id));
    }
  }

  private removeBots(): void {
    for (const [id, player] of this.players) {
      if (!player.bot) continue;
      if (this.simulation.cars.has(id)) this.simulation.removeCar(id);
      this.players.delete(id);
    }
  }

  private assignName(): string {
    const adjectives = ['Turbo', 'Cosmic', 'Mint', 'Coral', 'Gold', 'Swift', 'Neon', 'Lucky', 'Rapid', 'Electric', 'Wild', 'Silver'];
    const nouns = ['Fox', 'Otter', 'Falcon', 'Badger', 'Panda', 'Comet', 'Racer', 'Rocket', 'Gecko', 'Lynx', 'Wombat', 'Kestrel'];
    const taken = new Set([...this.players.values()].map(player => player.name));
    for (let attempt = 0; attempt < 20; attempt++) {
      const name = `${adjectives[Math.floor(this.random() * adjectives.length)]} ${nouns[Math.floor(this.random() * nouns.length)]}`;
      if (!taken.has(name)) return name;
    }
    let suffix = 1;
    while (taken.has(`Driver ${suffix}`)) suffix++;
    return `Driver ${suffix}`;
  }
}
