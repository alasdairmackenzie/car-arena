import Matter from 'matter-js';

const { Bodies, Body, Composite, Engine, Vector } = Matter;

export const STEP_MS = 1000 / 60;
export const ARENA = { width: 1440, height: 900, wall: 40 };
export const CAR = { length: 60, width: 32, mass: 3 };
export const HANDLING = {
  engineForce: 0.009,
  reverseForce: 0.005,
  rollingResistance: 0.00015,
  lateralGrip: 0.0015,
  handbrakeGrip: 0.0002,
  handbrakeResistance: 0.0011,
  steeringAngle: 0.48,
  drag: 0.008,
  driftStartSpeed: 180,
  driftFullSpeed: 360,
  driftStartSteering: 0.65,
  driftRearGrip: 0.0012,
};

export function automaticDrift(speed: number, steering: number, throttle: number): number {
  if (throttle <= 0) return 0;
  const speedFactor = Math.max(0, Math.min(1,
    (speed - HANDLING.driftStartSpeed) / (HANDLING.driftFullSpeed - HANDLING.driftStartSpeed)));
  const steeringFactor = Math.max(0, Math.min(1,
    (Math.abs(steering) - HANDLING.driftStartSteering) / (1 - HANDLING.driftStartSteering)));
  return speedFactor * steeringFactor;
}

export interface CarInput {
  throttle: number;
  steering: number;
  handbrake: boolean;
  fire: boolean;
}

export function isCarInput(value: unknown): value is CarInput {
  if (typeof value !== 'object' || value === null) return false;
  return 'throttle' in value && typeof value.throttle === 'number' &&
    Number.isFinite(value.throttle) && Math.abs(value.throttle) <= 1 &&
    'steering' in value && typeof value.steering === 'number' &&
    Number.isFinite(value.steering) && Math.abs(value.steering) <= 1 &&
    'handbrake' in value && typeof value.handbrake === 'boolean' &&
    'fire' in value && typeof value.fire === 'boolean';
}

export const idleInput = (): CarInput => ({
  throttle: 0, steering: 0, handbrake: false, fire: false,
});

export interface CarSnapshot {
  id: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  steering: number;
}

interface Vehicle {
  body: Matter.Body;
  input: CarInput;
  engineMultiplier: number;
}

export class Simulation {
  readonly engine = Engine.create({ gravity: { x: 0, y: 0 } });
  readonly cars = new Map<string, Vehicle>();

  constructor() {
    const { width, height, wall } = ARENA;
    Composite.add(this.engine.world, [
      Bodies.rectangle(width / 2, wall / 2, width, wall, { isStatic: true }),
      Bodies.rectangle(width / 2, height - wall / 2, width, wall, { isStatic: true }),
      Bodies.rectangle(wall / 2, height / 2, wall, height, { isStatic: true }),
      Bodies.rectangle(width - wall / 2, height / 2, wall, height, { isStatic: true }),
    ]);
  }

  addCar(id: string, x = ARENA.width / 2, y = ARENA.height / 2): void {
    if (this.cars.has(id)) throw new Error(`Car already exists: ${id}`);
    const body = Bodies.rectangle(x, y, CAR.length, CAR.width, {
      frictionAir: HANDLING.drag, friction: 0.1, restitution: 0.3,
    });
    Body.setMass(body, CAR.mass);
    Body.setAngle(body, -Math.PI / 2);
    this.cars.set(id, { body, input: idleInput(), engineMultiplier: 1 });
    Composite.add(this.engine.world, body);
  }

  removeCar(id: string): void {
    const vehicle = this.requireCar(id);
    Composite.remove(this.engine.world, vehicle.body);
    this.cars.delete(id);
  }

  setInput(id: string, input: CarInput): void {
    if (!isCarInput(input)) throw new Error('Invalid car input');
    this.requireCar(id).input = { ...input };
  }

  setEngineMultiplier(id: string, multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 2) throw new Error('Invalid engine multiplier');
    this.requireCar(id).engineMultiplier = multiplier;
  }

  resetCar(id: string, x = ARENA.width / 2, y = ARENA.height / 2): void {
    const car = this.requireCar(id);
    Body.setPosition(car.body, { x, y });
    Body.setAngle(car.body, -Math.PI / 2);
    Body.setVelocity(car.body, { x: 0, y: 0 });
    Body.setAngularVelocity(car.body, 0);
    car.body.force.x = 0;
    car.body.force.y = 0;
    car.body.torque = 0;
    car.input = idleInput();
    car.engineMultiplier = 1;
  }

  step(): void {
    for (const car of this.cars.values()) this.applyTyreForces(car);
    Engine.update(this.engine, STEP_MS);
  }

  snapshot(): CarSnapshot[] {
    return [...this.cars].map(([id, { body, input }]) => ({
      id, x: body.position.x, y: body.position.y,
      angle: body.angle, speed: Body.getSpeed(body) * 60,
      steering: input.steering,
    }));
  }

  private requireCar(id: string): Vehicle {
    const car = this.cars.get(id);
    if (!car) throw new Error(`Unknown car: ${id}`);
    return car;
  }

  private applyTyreForces({ body, input, engineMultiplier }: Vehicle): void {
    const velocity = Body.getVelocity(body);
    const angularVelocity = Body.getAngularVelocity(body);
    const forwardSpeed = (velocity.x * Math.cos(body.angle) + velocity.y * Math.sin(body.angle)) * 60;
    const drift = automaticDrift(forwardSpeed, input.steering, input.throttle);
    for (const longitudinal of [-22, 22]) {
      for (const lateral of [-12, 12]) {
        const rear = longitudinal < 0;
        const offset = Vector.rotate({ x: longitudinal, y: lateral }, body.angle);
        const point = Vector.add(body.position, offset);
        const pointVelocity = {
          x: velocity.x - angularVelocity * offset.y,
          y: velocity.y + angularVelocity * offset.x,
        };
        const heading = body.angle + (rear ? 0 : input.steering * HANDLING.steeringAngle);
        const forward = { x: Math.cos(heading), y: Math.sin(heading) };
        const sideways = { x: -forward.y, y: forward.x };
        const grip = rear && input.handbrake ? HANDLING.handbrakeGrip
          : rear ? HANDLING.lateralGrip + (HANDLING.driftRearGrip - HANDLING.lateralGrip) * drift
          : HANDLING.lateralGrip;
        const rolling = rear && input.handbrake ? HANDLING.handbrakeResistance : HANDLING.rollingResistance;
        const along = Vector.dot(pointVelocity, forward);
        const across = Vector.dot(pointVelocity, sideways);
        Body.applyForce(body, point, {
          x: -forward.x * along * rolling - sideways.x * across * grip,
          y: -forward.y * along * rolling - sideways.y * across * grip,
        });
      }
    }
    const force = input.throttle * (input.throttle < 0 ? HANDLING.reverseForce : HANDLING.engineForce) * engineMultiplier;
    Body.applyForce(body, body.position, {
      x: Math.cos(body.angle) * force,
      y: Math.sin(body.angle) * force,
    });
  }
}
