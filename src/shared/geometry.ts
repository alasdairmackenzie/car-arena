import { CAR, type CarSnapshot } from './simulation';

export interface Point { x: number; y: number }

export function segmentBoxHit(start: Point, end: Point, halfX: number, halfY: number): number | undefined {
  let enter = 0;
  let exit = 1;
  for (const [origin, delta, half] of [
    [start.x, end.x - start.x, halfX],
    [start.y, end.y - start.y, halfY],
  ]) {
    if (Math.abs(delta) < 1e-10) {
      if (Math.abs(origin) > half) return undefined;
      continue;
    }
    const a = (-half - origin) / delta;
    const b = (half - origin) / delta;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (enter > exit) return undefined;
  }
  return enter;
}

export function segmentCarHit(start: Point, end: Point, before: CarSnapshot, after: CarSnapshot): number | undefined {
  const local = (point: Point, car: CarSnapshot): Point => {
    const x = point.x - car.x;
    const y = point.y - car.y;
    return {
      x: x * Math.cos(after.angle) + y * Math.sin(after.angle),
      y: -x * Math.sin(after.angle) + y * Math.cos(after.angle),
    };
  };
  // Sweep relative to translation; orientation is sampled at this fixed tick.
  return segmentBoxHit(local(start, before), local(end, after), CAR.length / 2 + 2, CAR.width / 2 + 2);
}

export function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - start.x - dx * t, point.y - start.y - dy * t);
}
