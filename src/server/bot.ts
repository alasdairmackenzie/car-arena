import { ARENA, idleInput, type CarInput } from '../shared/simulation';
import { RULES, type CoreSnapshot, type GameSnapshot, type PlayerSnapshot } from '../shared/game';

export const BOT_BEHAVIOR = {
  throttle: 0.45,
  aimRefreshTicks: 20 * 60,
  stuckTicks: 60,
  progressDistance: 24,
  reverseTicks: 75,
  escapeTicks: 120,
  wallMargin: 160,
};

export interface BotMemory {
  progress?: { x: number; y: number; tick: number };
  reverseUntil?: number;
  escapeUntil?: number;
}

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

export function botInput(player: PlayerSnapshot, game: GameSnapshot, tick: number, memory: BotMemory = {}): CarInput {
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
  let target = (core ? botCoreTarget(player.id, core, Math.floor(localTick / BOT_BEHAVIOR.aimRefreshTicks)) : undefined) ??
    nearest(game.powerUps.filter(pickup => pickup.kind !== 'damage')) ?? enemy;
  if (!target) return idleInput();
  const recovering = tick < (memory.escapeUntil ?? 0);
  if (recovering || !memory.progress ||
    Math.hypot(player.x - memory.progress.x, player.y - memory.progress.y) >= BOT_BEHAVIOR.progressDistance) {
    memory.progress = { x: player.x, y: player.y, tick };
  } else if (tick - memory.progress.tick >= BOT_BEHAVIOR.stuckTicks && player.speed < 35) {
    memory.reverseUntil = tick + BOT_BEHAVIOR.reverseTicks;
    memory.escapeUntil = memory.reverseUntil + BOT_BEHAVIOR.escapeTicks;
    memory.progress = { x: player.x, y: player.y, tick };
  }
  const reversing = tick < (memory.reverseUntil ?? 0);
  if (tick < (memory.escapeUntil ?? 0)) {
    target = { x: ARENA.width / 2, y: ARENA.height / 2 };
  } else {
    const lookAhead = 80 + player.speed * 0.5;
    const x = player.x + Math.cos(player.angle) * lookAhead;
    const y = player.y + Math.sin(player.angle) * lookAhead;
    const margin = ARENA.wall + BOT_BEHAVIOR.wallMargin;
    const pushX = Math.max(0, margin - x) - Math.max(0, x - (ARENA.width - margin));
    const pushY = Math.max(0, margin - y) - Math.max(0, y - (ARENA.height - margin));
    if (pushX || pushY) {
      const distance = Math.max(1, Math.hypot(target.x - player.x, target.y - player.y));
      target = {
        x: player.x + (target.x - player.x) / distance * 100 + pushX * 3,
        y: player.y + (target.y - player.y) / distance * 100 + pushY * 3,
      };
    }
  }
  const difference = (point: { x: number; y: number }): number => {
    const angle = Math.atan2(point.y - player.y, point.x - player.x) - player.angle;
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  };
  const turn = difference(target);
  return {
    throttle: reversing ? -0.4 : Math.abs(turn) > 1.2 ? 0.3 : BOT_BEHAVIOR.throttle,
    steering: Math.max(-1, Math.min(1, turn * (reversing ? -2 : 2))),
    handbrake: false,
    fire: Boolean(localTick % 120 < 30 && enemy && Math.abs(difference(enemy)) < 0.18 &&
      Math.hypot(enemy.x - player.x, enemy.y - player.y) < 650),
  };
}
