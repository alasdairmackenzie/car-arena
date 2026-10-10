import { schema, t, type SchemaType } from '@colyseus/schema';

export const PlayerState = schema({
  x: t.number().default(0),
  y: t.number().default(0),
  angle: t.number().default(0),
  speed: t.number().default(0),
  steering: t.number().default(0),
}, 'PlayerState');

export const ArenaState = schema({
  players: t.map(PlayerState),
  tick: t.number().default(0),
}, 'ArenaState');

export type ArenaState = SchemaType<typeof ArenaState>;
