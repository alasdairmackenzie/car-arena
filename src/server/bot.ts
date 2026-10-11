import { ARENA, idleInput, type CarInput } from '../shared/simulation';
import { RULES, type CoreSnapshot, type GameSnapshot, type PlayerSnapshot } from '../shared/game';

export const BOT_BEHAVIOR = {
  throttle: 0.45,
  aimRefreshTicks: 20 * 60,
};

export function botCoreTarget(botId: string, core: CoreSnapshot, chaseCycle: number): { x: number; y: number } {
  let seed = 2166136261;
  for (const char of `${botId}:${core.id}:${chaseCycle}`) {
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  const direction = seed % 4;
  const distance = 15 + (seed >>> 2) % 51;
  return {
    x: Math.max(ARENA.wall + 40, Math.min(ARENA.width - ARENA.wall - 40,
      core.x + (direction === 0 ? -distance : direction === 1 ? distance : 0))),
    y: Math.max(ARENA.wall + 40, Math.min(ARENA.height - ARENA.wall - 40,
      core.y + (direction === 2 ? -distance : direction === 3 ? distance : 0))),
  };
}

export function botInput(player: PlayerSnapshot, game: GameSnapshot, tick: number): CarInput {
  if (!player.alive || player.spectator || game.phase !== 'active') return idleInput();
  const offset = [...player.id].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 0) >>> 0;
  const elapsed = RULES.roundTicks - game.phaseTicks;
  const localTick = elapsed + offset % BOT_BEHAVIOR.aimRefreshTicks;
  const opponents = game.players.filter(other => other.id !== player.id && other.alive && !other.spectator);
  const nearest = <T extends { x: number; y: number }>(points: T[]): T | undefined =>
    points.reduce<T | undefined>((best, point) =>
      !best || Math.hypot(point.x - player.x, point.y - player.y) < Math.hypot(best.x - player.x, best.y - player.y) ? point : best, undefined);
  const enemy = nearest(opponents);
  const core = nearest(game.cores);
  const target = (core ? botCoreTarget(player.id, core, Math.floor(localTick / BOT_BEHAVIOR.aimRefreshTicks)) : undefined) ??
    nearest(game.powerUps.filter(pickup => pickup.kind !== 'damage')) ?? enemy;
  if (!target) return idleInput();
  const difference = (point: { x: number; y: number }): number => {
    const angle = Math.atan2(point.y - player.y, point.x - player.x) - player.angle;
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  };
  const turn = difference(target);
  // Periodic reversing lets stalled cars escape walls and head-on collisions.
  const reversing = player.speed < 35 && (tick + offset % 240) % 240 >= 150;
  return {
    throttle: reversing ? -0.4 : Math.abs(turn) > 1.2 ? 0.3 : BOT_BEHAVIOR.throttle,
    steering: Math.max(-1, Math.min(1, turn * (reversing ? -2 : 2))),
    handbrake: false,
    fire: Boolean(localTick % 120 < 30 && enemy && Math.abs(difference(enemy)) < 0.18 &&
      Math.hypot(enemy.x - player.x, enemy.y - player.y) < 650),
  };
}
