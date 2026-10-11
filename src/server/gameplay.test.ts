import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import { MAX_CONNECTIONS, MAX_PLAYERS } from './session';
import { HumanTestSession as ArenaSession } from '../../tests/human-session';
import { ARENA, idleInput } from '../shared/simulation';
import { POWER_UP_KINDS, RULES, type PowerUpKind } from '../shared/game';

function randomSource(): () => number {
  let seed = 12345;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function advance(session: ArenaSession, ticks: number): void {
  for (let i = 0; i < ticks; i++) session.step();
}

function place(session: ArenaSession, id: string, x: number, y: number, angle = -Math.PI / 2): void {
  const body = session.simulation.cars.get(id)!.body;
  Matter.Body.setPosition(body, { x, y });
  Matter.Body.setAngle(body, angle);
  Matter.Body.setVelocity(body, { x: 0, y: 0 });
  Matter.Body.setAngularVelocity(body, 0);
}

function collect(session: ArenaSession, id: string): void {
  for (let i = 0; !session.cores.size && i < RULES.coreSpawnMaxTicks; i++) session.step();
  const core = [...session.cores.values()][0];
  if (!core) throw new Error('No core available');
  place(session, id, core.x, core.y);
  session.step();
}

function match(count = 2): ArenaSession {
  const session = new ArenaSession(randomSource());
  for (let i = 0; i < count; i++) session.join(`p${i}`);
  advance(session, RULES.countdownTicks);
  return session;
}

function duel(): ArenaSession {
  const session = match();
  advance(session, RULES.protectionTicks);
  place(session, 'p0', 720, 450);
  place(session, 'p1', 720, 300);
  session.step();
  return session;
}

function fire(session: ArenaSession, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    session.input('p0', { ...idleInput(), fire: true });
    session.step();
  }
}

describe('countdown, timer and spectator rotation', () => {
  it('waits for players, counts down five seconds and blocks driving/firing beforehand', () => {
    const session = new ArenaSession(randomSource());
    advance(session, 100);
    expect(session.phase).toBe('waiting');
    expect(session.cores.size).toBe(0);
    session.join('p0');
    expect(session.phase).toBe('countdown');
    expect(session.simulation.cars.size).toBe(1);
    session.join('p1');
    expect(session.phase).toBe('countdown');
    expect(session.snapshot().phaseTicks).toBe(300);
    session.input('p0', { ...idleInput(), throttle: 1, fire: true });
    advance(session, 299);
    expect(session.phase).toBe('countdown');
    expect(session.snapshot().players[0].y).toBe(450);
    expect(session.projectiles.size).toBe(0);
    session.step();
    expect(session.phase).toBe('active');
    expect(session.snapshot().phaseTicks).toBe(7200);
    expect(session.cores.size).toBe(3);
    expect(session.players.get('p0')!.input).toEqual(idleInput());
  });

  it('ends at exactly two minutes, awards the highest score and records a win once', () => {
    const session = match();
    collect(session, 'p0');
    // Place both cars away from collectibles before the timeout.
    place(session, 'p0', 720, 450);
    place(session, 'p1', 720, 300);
    advance(session, RULES.roundTicks - 2);
    expect(session.phase).toBe('active');
    expect(session.snapshot().phaseTicks).toBe(1);
    session.step();
    expect(session.phase).toBe('results');
    expect(session.result).toBe('timeout');
    expect(session.winner).toBe('p0');
    expect(session.winnerName).toBe(session.players.get('p0')!.name);
    expect(session.players.get('p0')!.wins).toBe(1);
    advance(session, 100);
    expect(session.players.get('p0')!.wins).toBe(1);
  });

  it('declares a draw for equal top scores, including zero, without adding wins', () => {
    for (const score of [0, 1]) {
      const session = match();
      if (score) {
        collect(session, 'p0');
        collect(session, 'p1');
      }
      place(session, 'p0', 720, 450);
      place(session, 'p1', 720, 300);
      advance(session, RULES.roundTicks);
      expect(session.phase).toBe('results');
      expect(session.result).toBe('draw');
      expect(session.winner).toBe('');
      expect([...session.players.values()].every(player => player.wins === 0)).toBe(true);
    }
  });

  it('wins early at exactly five, freezes gameplay, then counts down a clean new round', () => {
    const session = match();
    for (let i = 0; i < 4; i++) collect(session, 'p0');
    expect(session.phase).toBe('active');
    expect(session.players.get('p0')!.cores).toBe(4);
    collect(session, 'p0');
    expect(session.phase).toBe('results');
    expect(session.result).toBe('five-cores');
    expect(session.winner).toBe('p0');
    expect(session.players.get('p0')!.cores).toBe(5);
    const position = session.players.get('p0')!.pose;
    session.input('p0', { ...idleInput(), throttle: 1, fire: true });
    advance(session, RULES.restartTicks - 1);
    expect(session.phase).toBe('results');
    expect(session.players.get('p0')!.pose).toEqual(position);
    session.step();
    expect(session.phase).toBe('countdown');
    expect(session.round).toBe(2);
    expect(session.winner).toBe('');
    expect(session.cores.size).toBe(0);
    expect(session.players.get('p0')!.wins).toBe(1);
    expect(session.players.get('p0')!.cores).toBe(0);
    advance(session, RULES.countdownTicks);
    expect(session.phase).toBe('active');
    expect(session.snapshot().phaseTicks).toBe(RULES.roundTicks);
  });

  it('queues late arrivals FIFO without cars, and rotates them before returning drivers', () => {
    const session = match(MAX_PLAYERS);
    const priorNames = session.snapshot().players.map(player => player.name);
    for (let i = 5; i < 12; i++) session.join(`p${i}`);
    expect(session.simulation.cars.size).toBe(5);
    expect(session.snapshot().players.find(player => player.id === 'p5')!.queuePosition).toBe(1);
    expect(session.snapshot().players.find(player => player.id === 'p11')!.queuePosition).toBe(7);
    session.input('p5', { ...idleInput(), throttle: 1, fire: true });
    expect(session.players.get('p5')!.input).toEqual(idleInput());
    expect(session.reset('p5')).toContain('Spectating');
    for (let i = 0; i < 5; i++) collect(session, 'p0');
    advance(session, RULES.restartTicks);
    expect(session.snapshot().players.filter(player => !player.spectator).map(player => player.id))
      .toEqual(['p5', 'p6', 'p7', 'p8', 'p9']);
    expect(session.snapshot().players.find(player => player.id === 'p10')!.queuePosition).toBe(1);
    expect(session.snapshot().players.find(player => player.id === 'p0')!.queuePosition).toBe(3);
    expect(session.snapshot().players.slice(0, 5).map(player => player.name)).toEqual(priorNames);
    expect(session.players.get('p0')!.wins).toBe(1);
  });

  it('does not fill mid-round vacancies, removes departed spectators and resets empty lobbies', () => {
    const session = match();
    session.join('late');
    session.leave('p1');
    expect(session.players.get('late')!.spectator).toBe(true);
    expect(session.simulation.cars.has('late')).toBe(false);
    session.leave('late');
    expect(session.snapshot().players).toHaveLength(1);
    session.leave('p0');
    expect(session.phase).toBe('waiting');
    session.join('next');
    expect(session.phase).toBe('countdown');
    session.join('another');
    expect(session.phase).toBe('countdown');
  });

  it('allows arrivals and replaces vacancies during countdown only', () => {
    const session = new ArenaSession(randomSource());
    for (let i = 0; i < 6; i++) session.join(`p${i}`);
    expect(session.players.get('p5')!.spectator).toBe(true);
    session.leave('p0');
    expect(session.players.get('p5')!.spectator).toBe(false);
    expect(session.simulation.cars.size).toBe(5);
    advance(session, RULES.countdownTicks);
    session.join('late');
    expect(session.players.get('late')!.spectator).toBe(true);
  });

  it('cancels an undersized countdown and starts a full new countdown when a replacement joins', () => {
    const session = new ArenaSession(randomSource());
    session.join('p0');
    session.join('p1');
    advance(session, 100);
    session.join('p2');
    expect(session.snapshot().phaseTicks).toBe(200);
    session.leave('p2');
    expect(session.phase).toBe('countdown');
    session.leave('p1');
    expect(session.phase).toBe('countdown');
    session.leave('p0');
    expect(session.phase).toBe('waiting');
    expect(session.snapshot().phaseTicks).toBe(0);
    advance(session, RULES.countdownTicks);
    expect(session.phase).toBe('waiting');
    expect(session.simulation.cars.size).toBe(0);
    session.join('replacement');
    expect(session.phase).toBe('countdown');
    expect(session.snapshot().phaseTicks).toBe(RULES.countdownTicks);
    advance(session, RULES.countdownTicks);
    expect(session.phase).toBe('active');
  });

  it('assigns unique random names, handles collisions, and limits total connections separately from drivers', () => {
    const session = new ArenaSession(() => 0.5);
    for (let i = 0; i < MAX_CONNECTIONS; i++) session.join(String(i));
    const names = session.snapshot().players.map(player => player.name);
    expect(new Set(names).size).toBe(MAX_CONNECTIONS);
    expect(names[0]).toBe('Neon Racer');
    expect(session.simulation.cars.size).toBe(MAX_PLAYERS);
    expect(() => session.join('extra')).toThrow('full');
    session.leave('8');
    session.join('replacement');
    expect(session.players.get('replacement')!.wins).toBe(0);
  });
});

describe('random expiring gold cores', () => {
  it('spawns bounded, varied positions inside walls, separated from cars and each other', () => {
    const session = match();
    const cores = [...session.cores.values()];
    expect(cores).toHaveLength(RULES.initialCores);
    expect(new Set(cores.map(core => core.x)).size).toBeGreaterThan(1);
    for (const core of cores) {
      expect(core.x).toBeGreaterThanOrEqual(80);
      expect(core.x).toBeLessThanOrEqual(ARENA.width - 80);
      expect(core.y).toBeGreaterThanOrEqual(80);
      expect(core.y).toBeLessThanOrEqual(ARENA.height - 80);
      expect(core.expiresAt - session.tick).toBeGreaterThanOrEqual(RULES.coreLifetimeMinTicks);
      expect(core.expiresAt - session.tick).toBeLessThanOrEqual(RULES.coreLifetimeMaxTicks);
    }
    expect(new Set(cores.map(core => core.expiresAt)).size).toBeGreaterThan(1);
    advance(session, RULES.coreSpawnMaxTicks);
    expect(session.cores.size).toBeGreaterThan(RULES.initialCores);
    expect(session.cores.size).toBeLessThanOrEqual(RULES.maxCores);
    for (let i = 0; i < RULES.coreLifetimeMaxTicks * 2; i++) {
      session.step();
      expect(session.cores.size).toBeLessThanOrEqual(5);
    }
  });

  it('expires individual cores at their randomized lifetime and keeps replenishing without fixed pads', () => {
    const session = match();
    const initial = [...session.cores.values()];
    const first = initial.reduce((a, b) => a.expiresAt < b.expiresAt ? a : b);
    advance(session, first.expiresAt - session.tick - 1);
    expect(session.cores.has(first.id)).toBe(true);
    session.step();
    expect(session.cores.has(first.id)).toBe(false);
    advance(session, RULES.coreLifetimeMaxTicks);
    expect(initial.every(core => !session.cores.has(core.id))).toBe(true);
    expect(session.cores.size).toBeGreaterThan(0);
    expect(session.cores.size).toBeLessThanOrEqual(RULES.maxCores);
  });

  it('awards a contested core once and expires dropped cores without affecting carried inventory', () => {
    const session = match();
    const core = [...session.cores.values()][0];
    place(session, 'p0', core.x - 20, core.y);
    place(session, 'p1', core.x + 20, core.y);
    session.step();
    expect([...session.players.values()].reduce((sum, player) => sum + player.cores, 0)).toBe(1);
    const carrier = [...session.players].find(([, player]) => player.cores === 1)![0];
    const oldIds = new Set(session.cores.keys());
    session.reset(carrier);
    const drop = [...session.cores.values()].find(item => !oldIds.has(item.id))!;
    expect(drop.collectAt - session.tick).toBe(RULES.dropGraceTicks);
    expect(drop.expiresAt - session.tick).toBeGreaterThanOrEqual(RULES.coreLifetimeMinTicks);
    place(session, carrier === 'p0' ? 'p1' : 'p0', 720, 450);
    advance(session, drop.expiresAt - session.tick);
    expect(session.cores.has(drop.id)).toBe(false);
  });
});

describe('combat, drops and respawns', () => {
  it('deals 25 damage, kills in four shots, drops all cores and respawns empty', () => {
    const session = duel();
    collect(session, 'p1');
    collect(session, 'p1');
    place(session, 'p1', 720, 300);
    session.step();
    const oldIds = new Set(session.cores.keys());
    fire(session, 7);
    expect(session.players.get('p1')!.health).toBe(75);
    expect(session.players.get('p0')!.health).toBe(100);
    fire(session, 46);
    expect(session.players.get('p1')!.health).toBe(0);
    expect(session.players.get('p1')!.cores).toBe(0);
    expect(session.simulation.cars.has('p1')).toBe(false);
    const drops = [...session.cores.values()].filter(core => !oldIds.has(core.id) && core.collectAt > session.tick);
    expect(drops).toHaveLength(2);
    const remaining = session.snapshot().players.find(player => player.id === 'p1')!.respawnTicks;
    session.input('p0', idleInput());
    advance(session, remaining - 1);
    expect(session.players.get('p1')!.health).toBe(0);
    session.step();
    const respawned = session.snapshot().players.find(player => player.id === 'p1')!;
    expect(respawned.health).toBe(100);
    expect(respawned.cores).toBe(0);
    expect(respawned.protectionTicks).toBe(RULES.protectionTicks);
    expect(session.players.get('p1')!.input).toEqual(idleInput());
  });

  describe('one-point hazards and damage reasons', () => {
    it('power-down damages once, reports its reason and never grants a disruption charge', () => {
      const session = duel();
      grantPickup(session, 'p0', 'damage');
      const player = session.snapshot().players.find(player => player.id === 'p0')!;
      expect(player.health).toBe(99);
      expect(player.damageSequence).toBe(1);
      expect(player.damageReason).toBe('Picked up a power-down');
      expect(player.disruptor).toBe(false);
      advance(session, 20);
      expect(session.players.get('p0')!.health).toBe(99);
    });

    it('shield and spawn protection consume power-down without health loss or notification', () => {
      const session = match();
      grantPickup(session, 'p0', 'damage');
      expect(session.players.get('p0')!.health).toBe(100);
      expect(session.players.get('p0')!.damageSequence).toBe(0);
      advance(session, RULES.protectionTicks);
      grantPickup(session, 'p0', 'shield');
      grantPickup(session, 'p0', 'damage');
      expect(session.players.get('p0')!.health).toBe(100);
      expect(session.players.get('p0')!.damageSequence).toBe(0);
    });

    it('a lethal power-down drops inventory and uses normal respawn', () => {
      const session = duel();
      session.players.get('p0')!.health = 1;
      session.players.get('p0')!.cores = 2;
      const oldIds = new Set(session.cores.keys());
      grantPickup(session, 'p0', 'damage');
      expect(session.players.get('p0')!.health).toBe(0);
      expect(session.players.get('p0')!.cores).toBe(0);
      expect(session.simulation.cars.has('p0')).toBe(false);
      expect([...session.cores.values()].filter(core => !oldIds.has(core.id))).toHaveLength(2);
      advance(session, RULES.respawnTicks);
      expect(session.players.get('p0')!.health).toBe(100);
    });

    function ram(session: ArenaSession): void {
      place(session, 'p0', 720, 450);
      place(session, 'p1', 720, 387);
      Matter.Body.setVelocity(session.simulation.cars.get('p0')!.body, { x: 0, y: -5 });
      session.step();
    }

    it('ramming damages only the target once per new contact and reports a car hit', () => {
      const session = duel();
      ram(session);
      expect(session.players.get('p0')!.health).toBe(100);
      expect(session.players.get('p1')!.health).toBe(99);
      expect(session.players.get('p1')!.damageReason).toBe('Hit by another car');
      expect(session.players.get('p1')!.damageSequence).toBe(1);
      advance(session, 5);
      expect(session.players.get('p1')!.health).toBe(99);
      place(session, 'p0', 720, 600);
      place(session, 'p1', 720, 300);
      session.step();
      ram(session);
      expect(session.players.get('p1')!.health).toBe(98);
      expect(session.players.get('p1')!.damageSequence).toBe(2);
    });

    it('blocks protected collision damage and respawns a lethally rammed target', () => {
      const protectedSession = duel();
      grantPickup(protectedSession, 'p1', 'shield');
      ram(protectedSession);
      expect(protectedSession.players.get('p1')!.health).toBe(100);
      expect(protectedSession.players.get('p1')!.damageSequence).toBe(0);
      const spawning = match();
      ram(spawning);
      expect(spawning.players.get('p1')!.health).toBe(100);
      const lethal = duel();
      lethal.players.get('p1')!.health = 1;
      ram(lethal);
      expect(lethal.players.get('p1')!.health).toBe(0);
      expect(lethal.simulation.cars.has('p1')).toBe(false);
      advance(lethal, RULES.respawnTicks);
      expect(lethal.players.get('p1')!.health).toBe(100);
    });
  });

  function grantPickup(session: ArenaSession, id: string, kind: PowerUpKind): void {
    const pose = session.players.get(id)!.pose;
    session.powerUps.clear();
    session.powerUps.set('test-pickup', {
      id: 'test-pickup', x: pose.x, y: pose.y, kind, expiresAt: session.tick + 600,
    });
    session.step();
    expect(session.powerUps.has('test-pickup')).toBe(false);
  }

  describe('separate power-up pickups', () => {
    it('starts with three different kinds, caps their count and expires/replenishes pickups', () => {
      const session = match();
      const initial = [...session.powerUps.values()];
      expect(initial.map(pickup => pickup.kind)).toEqual(POWER_UP_KINDS.slice(0, RULES.initialPowerUps));
      expect(session.snapshot().powerUps).toHaveLength(3);
      for (const pickup of initial) {
        expect(pickup.expiresAt - session.tick).toBeGreaterThanOrEqual(RULES.powerUpLifetimeMinTicks);
        expect(pickup.expiresAt - session.tick).toBeLessThanOrEqual(RULES.powerUpLifetimeMaxTicks);
        for (const core of session.cores.values()) {
          expect(Math.hypot(core.x - pickup.x, core.y - pickup.y)).toBeGreaterThanOrEqual(70);
        }
      }
      const first = initial.reduce((a, b) => a.expiresAt < b.expiresAt ? a : b);
      advance(session, first.expiresAt - session.tick - 1);
      expect(session.powerUps.has(first.id)).toBe(true);
      session.step();
      expect(session.powerUps.has(first.id)).toBe(false);
      for (let i = 0; i < RULES.powerUpLifetimeMaxTicks; i++) {
        session.step();
        expect(session.powerUps.size).toBeLessThanOrEqual(RULES.maxPowerUps);
      }
      expect(initial.every(pickup => !session.powerUps.has(pickup.id))).toBe(true);
      expect(session.powerUps.size).toBeGreaterThan(0);
    });

    it('awards a contested pickup once, separately from goal inventory, and ignores spectators', () => {
      const session = match();
      session.join('spectator');
      session.powerUps.clear();
      session.powerUps.set('contested', { id: 'contested', kind: 'disruptor', x: 720, y: 450, expiresAt: session.tick + 600 });
      place(session, 'p0', 700, 450);
      place(session, 'p1', 740, 450);
      session.step();
      expect([...session.players.values()].filter(player => player.disruptor)).toHaveLength(1);
      expect([...session.players.values()].every(player => player.cores === 0)).toBe(true);
      expect(session.players.get('spectator')!.disruptor).toBe(false);
      expect(session.powerUps.has('contested')).toBe(false);
    });

    it('shield blocks bullets and disruption without preventing firing; expires exactly after eight seconds', () => {
      const session = duel();
      grantPickup(session, 'p1', 'shield');
      grantPickup(session, 'p0', 'disruptor');
      session.players.get('p1')!.cores = 2;
      const expires = session.players.get('p1')!.shieldUntil;
      fire(session, 7);
      expect(session.players.get('p1')!.health).toBe(100);
      expect(session.players.get('p1')!.cores).toBe(2);
      expect(session.players.get('p0')!.disruptor).toBe(true);
      session.input('p0', idleInput());
      session.input('p1', { ...idleInput(), fire: true });
      session.step();
      expect([...session.projectiles.values()].some(bullet => bullet.owner === 'p1')).toBe(true);
      session.input('p1', idleInput());
      advance(session, expires - session.tick - 1);
      expect(session.snapshot().players.find(player => player.id === 'p1')!.shieldTicks).toBe(1);
      session.step();
      expect(session.snapshot().players.find(player => player.id === 'p1')!.shieldTicks).toBe(0);
      const oldIds = new Set(session.cores.keys());
      fire(session, 7);
      expect(session.players.get('p1')!.health).toBe(75);
      expect(session.players.get('p1')!.cores).toBe(1);
      expect(session.players.get('p0')!.disruptor).toBe(false);
      const drop = [...session.cores.values()].find(core => !oldIds.has(core.id) && core.collectAt > session.tick)!;
      expect(drop).toBeDefined();
      expect(drop.collectAt).toBeGreaterThan(session.tick);
      session.input('p0', idleInput());
      place(session, 'p0', drop.x, drop.y);
      advance(session, drop.collectAt - session.tick);
      expect(session.players.get('p0')!.cores).toBe(1);
    });

    it('keeps a disruption charge after a miss, consumes it only once and never creates cores', () => {
      const session = duel();
      grantPickup(session, 'p0', 'disruptor');
      place(session, 'p1', 1000, 300);
      fire(session, 65);
      expect(session.players.get('p0')!.disruptor).toBe(true);
      place(session, 'p1', 720, 300);
      session.players.get('p1')!.cores = 2;
      fire(session, 30);
      expect(session.players.get('p1')!.cores).toBe(1);
      expect(session.players.get('p0')!.disruptor).toBe(false);

      const emptyTarget = duel();
      grantPickup(emptyTarget, 'p0', 'disruptor');
      const oldIds = new Set(emptyTarget.cores.keys());
      fire(emptyTarget, 7);
      expect(emptyTarget.players.get('p0')!.disruptor).toBe(false);
      expect([...emptyTarget.cores.values()].filter(core => !oldIds.has(core.id) && core.collectAt > emptyTarget.tick)).toHaveLength(0);
    });

    it('boost increases real driving speed, refreshes rather than stacks, and expires back to normal thrust', () => {
      const normal = duel();
      const boosted = duel();
      grantPickup(boosted, 'p0', 'speed');
      normal.step();
      for (const session of [normal, boosted]) {
        place(session, 'p0', 720, 700, 0);
        for (let i = 0; i < 40; i++) {
          session.input('p0', { ...idleInput(), throttle: 1 });
          session.step();
        }
      }
      expect(boosted.players.get('p0')!.pose.speed).toBeGreaterThan(normal.players.get('p0')!.pose.speed * 1.4);
      boosted.input('p0', idleInput());
      grantPickup(boosted, 'p0', 'speed');
      expect(boosted.snapshot().players.find(player => player.id === 'p0')!.boostTicks).toBe(RULES.boostTicks);
      place(boosted, 'p0', 720, 700, 0);
      advance(boosted, RULES.boostTicks);
      expect(boosted.snapshot().players.find(player => player.id === 'p0')!.boostTicks).toBe(0);
      expect(boosted.simulation.cars.get('p0')!.engineMultiplier).toBe(1);
    });

    it('clears effects on destruction/respawn and clears effects and pickups for the next round', () => {
      const session = duel();
      for (const kind of POWER_UP_KINDS) grantPickup(session, 'p0', kind);
      session.reset('p0');
      let player = session.snapshot().players.find(player => player.id === 'p0')!;
      expect([player.shieldTicks, player.boostTicks, player.disruptor]).toEqual([0, 0, false]);
      advance(session, RULES.respawnTicks);
      expect(session.simulation.cars.get('p0')!.engineMultiplier).toBe(1);
      for (const kind of POWER_UP_KINDS) grantPickup(session, 'p0', kind);
      for (let i = 0; i < RULES.goal; i++) collect(session, 'p1');
      advance(session, RULES.restartTicks);
      expect(session.phase).toBe('countdown');
      expect(session.powerUps.size).toBe(0);
      player = session.snapshot().players.find(player => player.id === 'p0')!;
      expect([player.shieldTicks, player.boostTicks, player.disruptor]).toEqual([0, 0, false]);
    });
  });

  it('honours drop grace and manual respawn cooldown, and releases cores on disconnect', () => {
    const session = duel();
    collect(session, 'p1');
    const oldIds = new Set(session.cores.keys());
    session.reset('p1');
    expect(session.reset('p1')).toBe('Already respawning.');
    const drop = [...session.cores.values()].find(core => !oldIds.has(core.id))!;
    place(session, 'p0', drop.x, drop.y);
    advance(session, RULES.dropGraceTicks - 1);
    expect(session.cores.has(drop.id)).toBe(true);
    session.step();
    expect(session.cores.has(drop.id)).toBe(false);
    expect(session.players.get('p0')!.cores).toBe(1);
    const count = session.cores.size;
    session.leave('p0');
    expect(session.cores.size).toBe(count + 1);
  });

  it('protects new spawns from damage and firing, expires fire input and bounds projectile lifetime', () => {
    const session = match();
    fire(session, RULES.protectionTicks - 1);
    expect(session.projectiles.size).toBe(0);
    expect(session.players.get('p1')!.health).toBe(100);
    session.input('p0', idleInput());
    session.step();
    place(session, 'p0', 320, 600, 0);
    place(session, 'p1', 320, 300);
    session.input('p0', { ...idleInput(), fire: true });
    advance(session, RULES.shotCooldownTicks);
    expect(session.projectiles.size).toBe(1);
    session.step();
    expect(session.projectiles.size).toBe(2);
    advance(session, 100);
    expect(session.players.get('p0')!.input.fire).toBe(false);
    expect(session.projectiles.size).toBe(0);
  });

  it('keeps a declared winner and name if they disconnect', () => {
    const session = match();
    for (let i = 0; i < 5; i++) collect(session, 'p0');
    const name = session.winnerName;
    session.leave('p0');
    expect(session.winner).toBe('p0');
    expect(session.winnerName).toBe(name);
    advance(session, RULES.restartTicks);
    expect(session.phase).toBe('countdown');
    expect(session.winner).toBe('');
    expect(session.snapshot().players.map(player => player.id)).toEqual(['p1']);
  });
});
