import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS } from './session';
import { HumanTestSession as ArenaSession } from '../../tests/human-session';
import { idleInput, isCarInput } from '../shared/simulation';
import Matter from 'matter-js';
import { RULES } from '../shared/game';

describe('authoritative arena session', () => {
  it('spawns distinct cars, caps the room and removes disconnected players', () => {
    const session = new ArenaSession();
    for (let i = 0; i < MAX_PLAYERS; i++) session.join(String(i));
    const cars = session.simulation.snapshot();
    for (const car of cars) {
      for (const other of cars.filter(other => other.id !== car.id)) {
        expect(Math.hypot(car.x - other.x, car.y - other.y)).toBeGreaterThan(100);
      }
    }
    session.join('extra');
    expect(session.players.get('extra')!.spectator).toBe(true);
    expect(session.simulation.cars.size).toBe(MAX_PLAYERS);
    session.leave('0');
    expect(session.players.get('extra')!.spectator).toBe(false);
    expect(session.simulation.cars.has('0')).toBe(false);
  });

  it('expires stale throttle but preserves continuously refreshed controls', () => {
    const stale = new ArenaSession();
    const active = new ArenaSession();
    for (const session of [stale, active]) {
      session.join('car');
      session.join('other');
      for (let i = 0; i < RULES.countdownTicks; i++) session.step();
      session.input('car', { ...idleInput(), throttle: 1 });
    }
    for (let i = 0; i < 75; i++) {
      stale.step();
      active.input('car', { ...idleInput(), throttle: 1 });
      active.step();
    }
    expect(stale.simulation.cars.get('car')!.input.throttle).toBe(0);
    expect(active.simulation.cars.get('car')!.input.throttle).toBe(1);
  });

  it('resets away from occupied spawn points', () => {
    const session = new ArenaSession();
    session.join('first');
    session.join('second');
    for (let i = 0; i < RULES.countdownTicks; i++) session.step();
    session.reset('second');
    for (let i = 0; i < RULES.respawnTicks; i++) session.step();
    const [first, second] = session.simulation.snapshot();
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(100);
  });

  it('car collisions affect the other car on the authoritative world', () => {
    const session = new ArenaSession();
    session.join('front');
    session.join('rear');
    for (let i = 0; i < RULES.countdownTicks; i++) session.step();
    Matter.Body.setPosition(session.simulation.cars.get('front')!.body, { x: 720, y: 320 });
    Matter.Body.setPosition(session.simulation.cars.get('rear')!.body, { x: 720, y: 450 });
    session.input('rear', { ...idleInput(), throttle: 1 });
    for (let i = 0; i < 25; i++) {
      session.input('rear', { ...idleInput(), throttle: 1 });
      session.step();
    }
    const front = session.simulation.snapshot().find(car => car.id === 'front')!;
    expect(front.y).toBeLessThan(310);
    expect(front.speed).toBeGreaterThan(5);
  });

  it('validates message types and finite bounded input axes', () => {
    for (const input of [null, [], 1, {}, { throttle: 1 }, {
      ...idleInput(), throttle: Infinity,
    }, { ...idleInput(), steering: -2 }, {
      ...idleInput(), handbrake: 'yes',
    }, { ...idleInput(), fire: 'yes' },
    { throttle: 0, steering: 0, handbrake: false }]) expect(isCarInput(input)).toBe(false);
    expect(isCarInput(idleInput())).toBe(true);
  });
});
