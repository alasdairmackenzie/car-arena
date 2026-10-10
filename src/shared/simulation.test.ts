import { describe, expect, it } from 'vitest';
import Matter from 'matter-js';
import { ARENA, idleInput, Simulation } from './simulation';

function world(): Simulation {
  const simulation = new Simulation();
  simulation.addCar('car');
  return simulation;
}

function advance(simulation: Simulation, steps: number): void {
  for (let i = 0; i < steps; i++) simulation.step();
}

describe('vehicle simulation', () => {
  it('stays still without input', () => {
    const simulation = world();
    advance(simulation, 120);
    expect(simulation.snapshot()[0].speed).toBe(0);
    expect(simulation.snapshot()[0].y).toBe(ARENA.height / 2);
  });

  it('accelerates forward and reverses', () => {
    const simulation = world();
    simulation.setInput('car', { ...idleInput(), throttle: 1 });
    advance(simulation, 30);
    expect(simulation.snapshot()[0].y).toBeLessThan(ARENA.height / 2 - 50);
    expect(simulation.snapshot()[0].speed).toBeGreaterThan(100);
    simulation.resetCar('car');
    simulation.setInput('car', { ...idleInput(), throttle: -1 });
    advance(simulation, 30);
    expect(simulation.snapshot()[0].y).toBeGreaterThan(ARENA.height / 2 + 30);
  });

  it('steers by applying tyre forces rather than rotating directly', () => {
    const simulation = world();
    simulation.setInput('car', { ...idleInput(), steering: 1 });
    advance(simulation, 10);
    expect(simulation.snapshot()[0].angle).toBe(-Math.PI / 2);
    simulation.setInput('car', { ...idleInput(), throttle: 1, steering: 1 });
    advance(simulation, 50);
    expect(simulation.snapshot()[0].angle).toBeGreaterThan(-Math.PI / 2 + 0.3);
  });

  it('handbrake slows the car more than coasting', () => {
    const coast = world();
    const brake = world();
    for (const simulation of [coast, brake]) {
      simulation.setInput('car', { ...idleInput(), throttle: 1 });
      advance(simulation, 20);
    }
    coast.setInput('car', idleInput());
    brake.setInput('car', { ...idleInput(), handbrake: true });
    advance(coast, 10);
    advance(brake, 10);
    expect(brake.snapshot()[0].speed).toBeLessThan(coast.snapshot()[0].speed * 0.5);
  });

  it('reduces rear sideways grip with the handbrake', () => {
    const grip = world();
    const drift = world();
    for (const simulation of [grip, drift]) {
      Matter.Body.setVelocity(simulation.cars.get('car')!.body, { x: 5, y: 0 });
    }
    drift.setInput('car', { ...idleInput(), handbrake: true });
    advance(grip, 1);
    advance(drift, 1);
    expect(drift.snapshot()[0].speed).toBeGreaterThan(grip.snapshot()[0].speed);
  });

  it('cannot drive through arena walls', () => {
    const simulation = world();
    simulation.setInput('car', { ...idleInput(), throttle: 1 });
    advance(simulation, 600);
    expect(simulation.snapshot()[0].y).toBeGreaterThanOrEqual(ARENA.wall + 30 - 1);
    expect(Number.isFinite(simulation.snapshot()[0].speed)).toBe(true);
  });

  it('reset clears momentum and inputs', () => {
    const simulation = world();
    simulation.setInput('car', { throttle: 1, steering: 1, handbrake: true });
    advance(simulation, 20);
    simulation.resetCar('car');
    advance(simulation, 10);
    expect(simulation.snapshot()[0]).toEqual({
      id: 'car', x: 720, y: 450, angle: -Math.PI / 2, speed: 0, steering: 0,
    });
  });

  it('rejects invalid inputs and duplicate cars', () => {
    const simulation = world();
    expect(() => simulation.setInput('car', { ...idleInput(), throttle: NaN })).toThrow('Invalid');
    expect(() => simulation.setInput('car', { ...idleInput(), steering: 2 })).toThrow('Invalid');
    expect(() => simulation.addCar('car')).toThrow('already exists');
    simulation.removeCar('car');
    expect(simulation.snapshot()).toEqual([]);
  });
});
