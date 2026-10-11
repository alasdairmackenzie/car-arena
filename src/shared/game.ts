import type { CarSnapshot } from './simulation';

export const RULES = {
  goal: 5,
  health: 100,
  damage: 25,
  shotCooldownTicks: 15,
  bulletSpeed: 1200,
  bulletLifetimeTicks: 60,
  respawnTicks: 180,
  protectionTicks: 120,
  restartTicks: 360,
  countdownTicks: 300,
  minDrivers: 1,
  maxDrivers: 5,
  roundTicks: 120 * 60,
  initialCores: 3,
  maxCores: 5,
  coreSpawnMinTicks: 30,
  coreSpawnMaxTicks: 120,
  coreLifetimeMinTicks: 480,
  coreLifetimeMaxTicks: 900,
  dropGraceTicks: 45,
  pickupRadius: 30,
  initialPowerUps: 3,
  maxPowerUps: 3,
  powerUpSpawnMinTicks: 300,
  powerUpSpawnMaxTicks: 480,
  powerUpLifetimeMinTicks: 720,
  powerUpLifetimeMaxTicks: 1080,
  shieldTicks: 480,
  boostTicks: 480,
  boostMultiplier: 1.6,
  powerDownDamage: 1,
  collisionDamage: 1,
};

export const POWER_UP_KINDS = ['shield', 'speed', 'disruptor', 'damage'] as const;
export type PowerUpKind = typeof POWER_UP_KINDS[number];
export function isPowerUpKind(kind: string): kind is PowerUpKind {
  return POWER_UP_KINDS.some(value => value === kind);
}

export type RoundPhase = 'waiting' | 'countdown' | 'active' | 'results';
export function isRoundPhase(phase: string): phase is RoundPhase {
  return ['waiting', 'countdown', 'active', 'results'].includes(phase);
}

export interface PlayerSnapshot extends CarSnapshot {
  bot: boolean;
  damageSequence: number;
  collisionSequence: number;
  wallCollisionSequence: number;
  corePickupSequence: number;
  powerUpPickupSequence: number;
  damageReason: string;
  health: number;
  cores: number;
  alive: boolean;
  respawnTicks: number;
  protectionTicks: number;
  spectator: boolean;
  queuePosition: number;
  name: string;
  wins: number;
  shieldTicks: number;
  boostTicks: number;
  disruptor: boolean;
}

export interface CoreSnapshot {
  id: string;
  x: number;
  y: number;
}

export interface ProjectileSnapshot extends CoreSnapshot {
  owner: string;
  angle: number;
}

export interface PowerUpSnapshot extends CoreSnapshot {
  kind: PowerUpKind;
}

export interface GameSnapshot {
  players: PlayerSnapshot[];
  cores: CoreSnapshot[];
  projectiles: ProjectileSnapshot[];
  powerUps: PowerUpSnapshot[];
  winner: string;
  round: number;
  restartTicks: number;
  phase: RoundPhase;
  phaseTicks: number;
  winnerName: string;
  result: string;
  lobbyName: string;
  maxDrivers: number;
  botsEnabled: boolean;
}

export const emptyGame = (): GameSnapshot => ({
  players: [], cores: [], projectiles: [], powerUps: [], winner: '', round: 1, restartTicks: 0,
  phase: 'waiting', phaseTicks: 0, winnerName: '', result: '',
  lobbyName: '', maxDrivers: RULES.maxDrivers, botsEnabled: true,
});
