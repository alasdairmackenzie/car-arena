import { schema, t, type SchemaType } from '@colyseus/schema';

export const PlayerState = schema({
  bot: t.boolean().default(false),
  damageSequence: t.number().default(0),
  damageReason: t.string().default(''),
  x: t.number().default(0),
  y: t.number().default(0),
  angle: t.number().default(0),
  speed: t.number().default(0),
  steering: t.number().default(0),
  health: t.number().default(100),
  cores: t.number().default(0),
  alive: t.boolean().default(true),
  respawnTicks: t.number().default(0),
  protectionTicks: t.number().default(0),
  spectator: t.boolean().default(true),
  queuePosition: t.number().default(0),
  name: t.string().default(''),
  wins: t.number().default(0),
  shieldTicks: t.number().default(0),
  boostTicks: t.number().default(0),
  disruptor: t.boolean().default(false),
}, 'PlayerState');

export const CoreState = schema({
  x: t.number().default(0),
  y: t.number().default(0),
}, 'CoreState');

export const PowerUpState = schema({
  x: t.number().default(0),
  y: t.number().default(0),
  kind: t.string().default('shield'),
}, 'PowerUpState');

export const ProjectileState = schema({
  x: t.number().default(0),
  y: t.number().default(0),
  owner: t.string().default(''),
  angle: t.number().default(0),
}, 'ProjectileState');

export const ArenaState = schema({
  players: t.map(PlayerState),
  cores: t.map(CoreState),
  powerUps: t.map(PowerUpState),
  projectiles: t.map(ProjectileState),
  tick: t.number().default(0),
  winner: t.string().default(''),
  round: t.number().default(1),
  restartTicks: t.number().default(0),
  phase: t.string().default('waiting'),
  phaseTicks: t.number().default(0),
  winnerName: t.string().default(''),
  result: t.string().default(''),
  lobbyName: t.string().default(''),
  maxDrivers: t.number().default(5),
  botsEnabled: t.boolean().default(true),
}, 'ArenaState');

export type ArenaState = SchemaType<typeof ArenaState>;
