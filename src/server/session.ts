import { idleInput, Simulation, STEP_MS, type CarInput } from '../shared/simulation';

export const INPUT_TIMEOUT_MS = 500;
export const MAX_PLAYERS = 8;

const spawns = [
  { x: 720, y: 450 },
  { x: 720, y: 300 },
  ...[300, 600].flatMap(y => [320, 480, 640, 800, 960, 1120].map(x => ({ x, y }))),
];

export class ArenaSession {
  readonly simulation = new Simulation();
  private readonly lastInputs = new Map<string, number>();
  private elapsed = 0;
  tick = 0;

  join(id: string): void {
    if (this.simulation.cars.size >= MAX_PLAYERS) throw new Error('Arena is full');
    const spawn = this.findSpawn();
    this.simulation.addCar(id, spawn.x, spawn.y);
    this.lastInputs.set(id, this.elapsed);
  }

  leave(id: string): void {
    this.simulation.removeCar(id);
    this.lastInputs.delete(id);
  }

  input(id: string, input: CarInput): void {
    this.simulation.setInput(id, input);
    this.lastInputs.set(id, this.elapsed);
  }

  reset(id: string): void {
    const spawn = this.findSpawn(id);
    this.simulation.resetCar(id, spawn.x, spawn.y);
    this.lastInputs.set(id, this.elapsed);
  }

  step(): void {
    this.elapsed += STEP_MS;
    for (const [id, receivedAt] of this.lastInputs) {
      if (this.elapsed - receivedAt >= INPUT_TIMEOUT_MS) {
        this.simulation.setInput(id, idleInput());
      }
    }
    this.simulation.step();
    this.tick++;
  }

  private findSpawn(excludeId?: string): { x: number; y: number } {
    const cars = this.simulation.snapshot().filter(car => car.id !== excludeId);
    const spawn = spawns.find(point =>
      cars.every(car => Math.hypot(car.x - point.x, car.y - point.y) > 100));
    if (!spawn) throw new Error('Spawn areas are blocked. Drive away from the starting area.');
    return spawn;
  }
}
