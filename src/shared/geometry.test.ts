import { describe, expect, it } from 'vitest';
import { distanceToSegment, segmentBoxHit, segmentCarHit } from './geometry';
import type { CarSnapshot } from './simulation';

const car: CarSnapshot = { id: 'car', x: 100, y: 100, angle: 0, speed: 0, steering: 0 };

describe('swept hit detection', () => {
  it('detects a bullet crossing a whole car between ticks', () => {
    expect(segmentCarHit({ x: 0, y: 100 }, { x: 200, y: 100 }, car, car)).toBeCloseTo(0.34);
  });
  it('accounts for rotation and a translating target', () => {
    const rotated = { ...car, angle: Math.PI / 2 };
    expect(segmentCarHit({ x: 100, y: 0 }, { x: 100, y: 200 }, rotated, rotated)).toBeCloseTo(0.34);
    expect(segmentCarHit({ x: 100, y: 0 }, { x: 100, y: 200 },
      { ...car, x: 50 }, { ...car, x: 150 })).toBeDefined();
  });
  it('rejects misses and handles parallel and zero-length segments', () => {
    expect(segmentCarHit({ x: 0, y: 150 }, { x: 200, y: 150 }, car, car)).toBeUndefined();
    expect(segmentBoxHit({ x: 0, y: 0 }, { x: 0, y: 0 }, 10, 10)).toBe(0);
    expect(segmentBoxHit({ x: 20, y: 0 }, { x: 20, y: 0 }, 10, 10)).toBeUndefined();
  });
  it('sweeps core pickup distances so fast cars do not skip a core', () => {
    expect(distanceToSegment({ x: 50, y: 20 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(20);
    expect(distanceToSegment({ x: 50, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(50);
  });
});
