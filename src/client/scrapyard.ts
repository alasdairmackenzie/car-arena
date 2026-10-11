import type Phaser from 'phaser';
import { ARENA } from '../shared/simulation';

export function drawScrapyard(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const { width, height, wall } = ARENA;
  let seed = 73;
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  g.fillStyle(0x11171e).fillRect(0, 0, width, height);
  g.fillStyle(0x191f25).fillRect(wall, wall, width - wall * 2, height - wall * 2);
  // Bake asphalt detail once instead of rebuilding thousands of commands per frame.
  for (let i = 0; i < 3500; i++) {
    const x = wall + random() * (width - wall * 2);
    const y = wall + random() * (height - wall * 2);
    g.fillStyle(i % 2 ? 0x7b858c : 0x050b10, 0.12).fillRect(x, y, 1 + random() * 3, 1);
  }
  for (let i = 0; i < 22; i++) {
    const x = 100 + random() * (width - 200);
    const y = 100 + random() * (height - 200);
    g.fillStyle(0x070b10, 0.35).fillEllipse(x, y, 30 + random() * 80, 12 + random() * 40);
    g.lineStyle(2, 0x060b10, 0.6);
    let point = { x, y };
    for (let j = 0; j < 5; j++) {
      const next = { x: point.x + (random() - 0.5) * 40, y: point.y + (random() - 0.5) * 35 };
      g.lineBetween(point.x, point.y, next.x, next.y);
      point = next;
    }
  }
  for (const y of [150, height - 150]) {
    for (let x = 120; x < width - 120; x += 90) {
      g.fillStyle(0xc6ba85, 0.17).fillRect(x, y, 48, 3);
    }
  }
  for (const x of [100, width - 190]) {
    for (let y = 230; y < height - 170; y += 75) {
      g.lineStyle(2, 0xb4af8c, 0.13).strokeRect(x, y, 90, 58);
    }
  }
  g.lineStyle(9, 0x080c10, 0.45).strokeEllipse(680, 460, 420, 250);
  g.lineStyle(3, 0x353f46, 0.5).strokeEllipse(680, 460, 390, 230);
  g.lineStyle(2, 0x72e4b0, 0.18).strokeCircle(width / 2, height / 2, 80);
  g.lineStyle(1, 0x72e4b0, 0.1).strokeCircle(width / 2, height / 2, 88);
  for (const x of [0, width - wall]) {
    g.fillStyle(0x35414a).fillRect(x, 0, wall, height);
    for (let y = wall; y < height - wall; y += 64) {
      g.fillStyle(0x273039).fillRect(x + 5, y, wall - 10, 58);
      g.fillStyle(0x080d12).fillCircle(x + 20, y + 8, 3).fillCircle(x + 20, y + 50, 3);
      g.fillStyle(0xc69a44, 0.75).fillPoints([
        { x: x + 7, y: y + 20 }, { x: x + 33, y: y + 6 },
        { x: x + 33, y: y + 17 }, { x: x + 7, y: y + 31 },
      ], true);
    }
  }
  for (const y of [0, height - wall]) {
    g.fillStyle(0x35414a).fillRect(0, y, width, wall);
    for (let x = wall; x < width - wall; x += 72) {
      g.fillStyle(0x242d35).fillRect(x, y + 5, 66, wall - 10);
      g.fillStyle(0xc69a44, 0.8).fillPoints([
        { x: x + 12, y: y + 7 }, { x: x + 26, y: y + 7 },
        { x: x + 44, y: y + 33 }, { x: x + 30, y: y + 33 },
      ], true);
    }
  }
  for (const x of [80, 360, 1080, width - 80]) {
    for (const y of [wall + 6, height - wall - 6]) {
      const color = x < width / 2 ? 0x67e8f9 : 0xd8a0ff;
      g.fillStyle(color, 0.035).fillCircle(x, y, 100);
      g.fillStyle(color, 0.06).fillCircle(x, y, 65);
      g.fillStyle(color, 0.13).fillCircle(x, y, 28);
      g.fillStyle(0x070b10).fillRoundedRect(x - 24, y - 8, 48, 16, 3);
      g.fillStyle(color).fillRect(x - 18, y - 2, 36, 4);
    }
  }
  g.generateTexture('scrapyard-floor', width, height);
  g.destroy();
  scene.add.image(0, 0, 'scrapyard-floor').setOrigin(0);
  const sign = (x: number, y: number, text: string, color: string, size: number): void => {
    scene.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: `${size}px`, fontStyle: 'bold',
      color, letterSpacing: 4,
    }).setOrigin(0.5).setAlpha(0.55);
  };
  sign(width / 2, 100, 'NEON SCRAPYARD', '#67e8f9', 22);
  sign(width / 2, height - 100, 'SALVAGE / SURVIVE / REPEAT', '#d8a0ff', 14);
  sign(width / 2, height / 2, 'SECTOR 05', '#626b70', 18);
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  duration: number;
  color: number;
}

export class ScrapyardEffects {
  private particles: Particle[] = [];

  burst(x: number, y: number, color: number): void {
    for (let i = 0; i < 10 && this.particles.length < 120; i++) {
      const angle = i * Math.PI * 2 / 10;
      this.particles.push({
        x, y, vx: Math.cos(angle) * 65, vy: Math.sin(angle) * 65,
        life: 0.4, duration: 0.4, color,
      });
    }
  }

  draw(g: Phaser.GameObjects.Graphics, delta: number, reducedMotion: boolean): void {
    if (reducedMotion) {
      this.particles = [];
      return;
    }
    const dt = Math.min(delta, 50) / 1000;
    this.particles = this.particles.filter(particle => particle.life > dt);
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      g.fillStyle(particle.color, particle.life / particle.duration).fillCircle(particle.x, particle.y, 2);
    }
  }
}
