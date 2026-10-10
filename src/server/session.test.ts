import { describe, expect, it } from 'vitest';
import { ArenaSession, MAX_PLAYERS } from './session';
import { idleInput, isCarInput } from '../shared/simulation';

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
    expect(() => session.join('extra')).toThrow('full');
    session.leave('0');
    session.join('extra');
    expect(session.simulation.cars.has('0')).toBe(false);
  });

  it('expires stale throttle but preserves continuously refreshed controls', () => {
    const stale = new ArenaSession();
    const active = new ArenaSession();
    for (const session of [stale, active]) {
      session.join('car');
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
    session.reset('second');
    const [first, second] = session.simulation.snapshot();
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(100);
  });

  it('car collisions affect the other car on the authoritative world', () => {
    const session = new ArenaSession();
    session.simulation.addCar('front', 720, 320);
    session.simulation.addCar('rear', 720, 450);
    session.input('rear', { ...idleInput(), throttle: 1 });
    for (let i = 0; i < 25; i++) session.step();
    const front = session.simulation.snapshot().find(car => car.id === 'front')!;
    expect(front.y).toBeLessThan(310);
    expect(front.speed).toBeGreaterThan(5);
  });

  it('validates message types and finite bounded input axes', () => {
    for (const input of [null, [], 1, {}, { throttle: 1 }, {
      throttle: Infinity, steering: 0, handbrake: false,
    }, { throttle: 0, steering: -2, handbrake: false }, {
      throttle: 0, steering: 0, handbrake: 'yes',
    }]) expect(isCarInput(input)).toBe(false);
    expect(isCarInput(idleInput())).toBe(true);
  });
});
