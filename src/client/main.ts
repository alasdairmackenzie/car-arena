import Phaser from 'phaser';
import { ARENA, CAR, Simulation, STEP_MS, HANDLING } from '../shared/simulation';
import { DrivingInput } from './input';
import './style.css';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
}

const arena = element('game');
const speed = element('speed');
const status = element('status');
const error = element('error');
const reset = element<HTMLButtonElement>('reset');

class ArenaScene extends Phaser.Scene {
  private readonly simulation = new Simulation();
  private graphics!: Phaser.GameObjects.Graphics;
  private inputController!: DrivingInput;
  private accumulator = 0;
  private telemetryElapsed = 0;

  constructor() { super('arena'); }

  create(): void {
    this.simulation.addCar('local');
    this.graphics = this.add.graphics();
    this.inputController = new DrivingInput(arena, this.resetCar);
    reset.addEventListener('click', this.resetCar);
    status.textContent = 'Ready. Focus the arena, then drive.';
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.inputController.destroy();
      reset.removeEventListener('click', this.resetCar);
    });
  }

  private readonly resetCar = (): void => {
    this.simulation.resetCar('local');
    this.accumulator = 0;
    status.textContent = 'Car reset.';
    arena.focus();
  };

  update(_time: number, delta: number): void {
    this.accumulator += Math.min(delta, 250);
    while (this.accumulator >= STEP_MS) {
      this.simulation.setInput('local', this.inputController.read());
      this.simulation.step();
      this.accumulator -= STEP_MS;
    }
    const car = this.simulation.snapshot()[0];
    const g = this.graphics;
    g.clear();
    g.fillStyle(0x18232d).fillRect(0, 0, ARENA.width, ARENA.height);
    g.lineStyle(1, 0x293844, 0.7);
    for (let x = ARENA.wall; x < ARENA.width; x += 80) g.lineBetween(x, ARENA.wall, x, ARENA.height - ARENA.wall);
    for (let y = ARENA.wall; y < ARENA.height; y += 80) g.lineBetween(ARENA.wall, y, ARENA.width - ARENA.wall, y);
    g.lineStyle(ARENA.wall, 0x3d505f).strokeRect(ARENA.wall / 2, ARENA.wall / 2, ARENA.width - ARENA.wall, ARENA.height - ARENA.wall);
    g.lineStyle(2, 0x72e4b0, 0.5).strokeCircle(ARENA.width / 2, ARENA.height / 2, 80);
    g.save();
    g.translateCanvas(car.x, car.y);
    g.rotateCanvas(car.angle);
    g.fillStyle(0x070e14).fillRoundedRect(-CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width, 7);
    for (const x of [-22, 22]) {
      for (const y of [-17, 17]) {
        g.save();
        g.translateCanvas(x, y);
        if (x > 0) g.rotateCanvas(car.steering * HANDLING.steeringAngle);
        g.fillStyle(0x070e14).fillRect(-8, -4, 16, 8);
        g.restore();
      }
    }
    g.fillStyle(0x72e4b0).fillRoundedRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 7);
    g.fillStyle(0x173842).fillRoundedRect(-10, -12, 23, 24, 4);
    g.fillStyle(0xc4f9e1).fillRect(22, -12, 5, 8).fillRect(22, 4, 5, 8);
    g.fillStyle(0xff6b70).fillRect(-29, -12, 4, 7).fillRect(-29, 5, 4, 7);
    g.restore();
    this.telemetryElapsed += delta;
    if (this.telemetryElapsed >= 100) {
      this.telemetryElapsed = 0;
      speed.textContent = `${Math.round(car.speed)} px/s`;
      arena.dataset.x = String(car.x);
      arena.dataset.y = String(car.y);
      arena.dataset.angle = String(car.angle);
      arena.dataset.speed = String(car.speed);
      arena.dataset.players = '1';
    }
  }
}

window.addEventListener('error', event => {
  error.hidden = false;
  error.textContent = `Game error: ${event.message}`;
});

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: ARENA.width,
  height: ARENA.height,
  backgroundColor: '#18232d',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: ArenaScene,
});
