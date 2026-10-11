import { describe, expect, it } from 'vitest';
import Matter from 'matter-js';
import { ArenaSession, MAX_CONNECTIONS, MAX_PLAYERS } from './session';
import { RULES } from '../shared/game';
import { ARENA, Simulation, isCarInput } from '../shared/simulation';
import { BOT_BEHAVIOR, botCoreTarget, botInput, type BotMemory } from './bot';

function session(): ArenaSession {
  let seed = 42;
  return new ArenaSession(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
}

function advance(game: ArenaSession, ticks: number): void {
  for (let i = 0; i < ticks; i++) game.step();
}

describe('five-driver races with bots', () => {
  it('only reverses after sustained lack of progress, then finishes its recovery', () => {
    const game = session();
    game.join('human');
    advance(game, RULES.countdownTicks);
    const snapshot = game.snapshot();
    const bot = { ...snapshot.players.find(player => player.bot)!, x: 720, y: 450, speed: 0 };
    const memory: BotMemory = {};
    for (let tick = 0; tick < BOT_BEHAVIOR.stuckTicks; tick++) {
      expect(botInput(bot, snapshot, tick, memory).throttle).toBeGreaterThan(0);
    }
    expect(botInput(bot, snapshot, BOT_BEHAVIOR.stuckTicks, memory).throttle).toBeLessThan(0);
    expect(botInput(bot, snapshot, BOT_BEHAVIOR.stuckTicks + BOT_BEHAVIOR.reverseTicks, memory).throttle)
      .toBeGreaterThan(0);
    const moving: BotMemory = {};
    for (let tick = 0; tick < 600; tick++) {
      expect(botInput({ ...bot, x: 500 + tick % 100, speed: 100 }, snapshot, tick, moving).throttle)
        .toBeGreaterThan(0);
    }
  });

  it.each([
    [72, 450, Math.PI], [1368, 450, 0], [720, 72, -Math.PI / 2], [720, 828, Math.PI / 2],
    [72, 72, -3 * Math.PI / 4], [1368, 72, -Math.PI / 4],
    [72, 828, 3 * Math.PI / 4], [1368, 828, Math.PI / 4],
  ])('escapes a wall or corner at (%s, %s) using real car physics', (x, y, angle) => {
    const game = session();
    game.join('human');
    advance(game, RULES.countdownTicks);
    const snapshot = game.snapshot();
    const bot = snapshot.players.find(player => player.bot)!;
    const simulation = new Simulation();
    simulation.addCar(bot.id, x, y);
    Matter.Body.setAngle(simulation.cars.get(bot.id)!.body, angle);
    const memory: BotMemory = {};
    let escaped = false;
    for (let tick = 0; tick < 600; tick++) {
      const player = { ...bot, ...simulation.snapshot()[0] };
      const input = botInput(player, {
        ...snapshot, players: [player], cores: [{ id: 'edge-core', x, y }], powerUps: [],
      }, tick, memory);
      expect(isCarInput(input)).toBe(true);
      simulation.setInput(bot.id, input);
      simulation.step();
      const car = simulation.snapshot()[0];
      escaped ||= Math.min(car.x - ARENA.wall, ARENA.width - ARENA.wall - car.x,
        car.y - ARENA.wall, ARENA.height - ARENA.wall - car.y) > 150;
    }
    expect(escaped).toBe(true);
  });

  it('aims to varied sides of cores, with stable chase targets and both hits and misses possible', () => {
    const core = { id: 'core-1', x: 720, y: 450 };
    const directions = new Set<string>();
    let withinPickupRadius = 0;
    let outsidePickupRadius = 0;
    for (let cycle = 0; cycle < 100; cycle++) {
      const target = botCoreTarget('bot-0', core, cycle);
      expect(botCoreTarget('bot-0', core, cycle)).toEqual(target);
      const dx = target.x - core.x;
      const dy = target.y - core.y;
      expect(dx === 0 || dy === 0).toBe(true);
      const distance = Math.hypot(dx, dy);
      expect(distance).toBeGreaterThanOrEqual(15);
      expect(distance).toBeLessThanOrEqual(65);
      directions.add(dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'above' : 'below');
      if (distance <= RULES.pickupRadius) withinPickupRadius++;
      else outsidePickupRadius++;
    }
    expect(directions.size).toBe(4);
    expect(withinPickupRadius).toBeGreaterThan(0);
    expect(outsidePickupRadius).toBeGreaterThan(0);
    expect(botCoreTarget('bot-1', core, 0)).not.toEqual(botCoreTarget('bot-0', core, 0));
  });

  it('gives the first human a varied safe position and keeps all starting cars separated', () => {
    const starts = new Set<string>();
    for (const value of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const game = new ArenaSession(() => value);
      game.join('human');
      const human = game.snapshot().players[0];
      expect(human.x).toBeGreaterThanOrEqual(100);
      expect(human.x).toBeLessThanOrEqual(ARENA.width - 100);
      expect(human.y).toBeGreaterThanOrEqual(100);
      expect(human.y).toBeLessThanOrEqual(ARENA.height - 100);
      starts.add(`${human.x},${human.y}`);
      advance(game, RULES.countdownTicks);
      const cars = game.simulation.snapshot();
      expect(cars).toHaveLength(5);
      for (const car of cars) {
        for (const other of cars.filter(other => other.id !== car.id)) {
          expect(Math.hypot(car.x - other.x, car.y - other.y)).toBeGreaterThan(100);
        }
      }
    }
    expect(starts.size).toBe(5);
  });

  it('starts for one human, fills to exactly five and bots drive and collect without client messages', () => {
    const game = session();
    game.join('human');
    expect(game.phase).toBe('countdown');
    expect(game.snapshot().phaseTicks).toBe(RULES.countdownTicks);
    advance(game, RULES.countdownTicks);
    expect(game.snapshot().players.filter(player => player.bot)).toHaveLength(4);
    expect(game.simulation.cars.size).toBe(5);
    const initial = game.snapshot();
    let collected = false;
    let fired = false;
    for (let i = 0; i < 3600 && game.phase === 'active'; i++) {
      game.step();
      collected ||= game.snapshot().players.some(player => player.bot && player.cores > 0);
      fired ||= [...game.projectiles.values()].some(bullet => game.players.get(bullet.owner)!.bot);
    }
    expect(collected).toBe(true);
    expect(fired).toBe(true);
    expect(game.snapshot().players.filter(player => player.bot).some(player => {
      const start = initial.players.find(other => other.id === player.id)!;
      return Math.hypot(player.x - start.x, player.y - start.y) > 100;
    })).toBe(true);
  });

  it('prioritizes countdown arrivals and queues mid-round humans ahead of returning drivers and bots', () => {
    const game = session();
    game.join('human');
    advance(game, 100);
    game.join('second');
    expect(game.snapshot().phaseTicks).toBe(200);
    advance(game, 200);
    expect(game.snapshot().players.filter(player => player.bot)).toHaveLength(3);
    for (let i = 0; i < 5; i++) game.join(`late-${i}`);
    expect(game.snapshot().players.find(player => player.id === 'late-0')!.queuePosition).toBe(1);
    expect(game.simulation.cars.size).toBe(5);
    const oldBots = game.snapshot().players.filter(player => player.bot).map(player => player.id);
    for (let i = 0; i < RULES.roundTicks && game.phase === 'active'; i++) game.step();
    expect(game.phase).toBe('results');
    advance(game, RULES.restartTicks);
    expect(game.snapshot().players.filter(player => !player.spectator).map(player => player.id))
      .toEqual(['late-0', 'late-1', 'late-2', 'late-3', 'late-4']);
    expect(oldBots.every(id => !game.players.has(id))).toBe(true);
    expect(game.snapshot().players.find(player => player.id === 'human')!.queuePosition).toBe(1);
    advance(game, RULES.countdownTicks);
    expect(game.simulation.cars.size).toBe(MAX_PLAYERS);
    expect(game.snapshot().players.some(player => player.bot)).toBe(false);
  });

  it('counts connection capacity separately, and clears bots and the arena when the last human leaves', () => {
    const game = session();
    game.join('human');
    advance(game, RULES.countdownTicks);
    for (let i = 1; i < MAX_CONNECTIONS; i++) game.join(`human-${i}`);
    expect(() => game.join('overflow')).toThrow('full');
    for (const player of game.snapshot().players.filter(player => !player.bot)) game.leave(player.id);
    expect(game.phase).toBe('waiting');
    expect(game.players.size).toBe(0);
    expect(game.simulation.cars.size).toBe(0);
    expect(game.cores.size).toBe(0);
    expect(game.powerUps.size).toBe(0);
    expect(game.projectiles.size).toBe(0);
  });

  it('uses valid bounded controls, cannot act in countdown, and aims at enemies without self-hits', () => {
    const game = session();
    game.join('human');
    advance(game, RULES.countdownTicks);
    const snapshot = game.snapshot();
    const bot = snapshot.players.find(player => player.bot)!;
    const enemy = snapshot.players.find(player => !player.bot)!;
    bot.x = enemy.x;
    bot.y = enemy.y + 150;
    bot.angle = -Math.PI / 2;
    snapshot.players = [bot, enemy];
    const offset = [...bot.id].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 0) >>> 0;
    snapshot.phaseTicks = RULES.roundTicks - (1320 - offset % BOT_BEHAVIOR.aimRefreshTicks);
    const input = botInput(bot, snapshot, 1);
    expect(isCarInput(input)).toBe(true);
    expect(input.fire).toBe(true);
    expect(botInput(bot, { ...snapshot, phase: 'countdown' }, 1).fire).toBe(false);
    expect(botInput({ ...bot, alive: false }, snapshot, 1).throttle).toBe(0);
  });

  it('uses reduced thrust without scheduled pauses throughout the round', () => {
    const game = session();
    game.join('human');
    advance(game, RULES.countdownTicks);
    const snapshot = game.snapshot();
    const bot = snapshot.players.find(player => player.bot)!;
    for (let elapsed = 0; elapsed < RULES.roundTicks; elapsed++) {
      const input = botInput({ ...bot, speed: 100 }, { ...snapshot, phaseTicks: RULES.roundTicks - elapsed }, elapsed);
      expect(input.handbrake).toBe(false);
      expect(input.throttle).toBeGreaterThan(0);
      expect(Math.abs(input.throttle)).toBeLessThanOrEqual(BOT_BEHAVIOR.throttle);
    }
  });

  it('pursues cores throughout the round, including the opening and former roaming periods', () => {
    const game = session();
    game.join('human');
    advance(game, RULES.countdownTicks);
    const snapshot = game.snapshot();
    const bot = { ...snapshot.players.find(player => player.bot)!, x: 720, y: 450, angle: 0, speed: 100 };
    const core = { id: 'target-core', x: 950, y: 650 };
    const offset = [...bot.id].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 0) >>> 0;
    let decisions = 0;
    for (let elapsed = 0; elapsed < RULES.roundTicks; elapsed += 30) {
      const input = botInput(bot, { ...snapshot, cores: [core], phaseTicks: RULES.roundTicks - elapsed }, elapsed);
      expect(input.handbrake).toBe(false);
      const localTick = elapsed + offset % BOT_BEHAVIOR.aimRefreshTicks;
      const target = botCoreTarget(bot.id, core, Math.floor(localTick / BOT_BEHAVIOR.aimRefreshTicks));
      const expectedSteering = Math.max(-1, Math.min(1, Math.atan2(target.y - bot.y, target.x - bot.x) * 2));
      expect(input.steering).toBeCloseTo(expectedSteering);
      expect(input.throttle).toBe(BOT_BEHAVIOR.throttle);
      decisions++;
    }
    expect(decisions).toBe(RULES.roundTicks / 30);
  });
});
