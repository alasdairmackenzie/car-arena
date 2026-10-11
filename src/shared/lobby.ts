import { RULES } from './game';

export const LOBBY_LIMITS = { minDrivers: 1, maxDrivers: 10, nameLength: 24 } as const;

export interface LobbySettings {
  name: string;
  maxDrivers: number;
  bots: boolean;
}

export interface LobbySummary extends LobbySettings {
  roomId: string;
  humans: number;
}

/** Validates untrusted create options; anything missing or malformed falls back to defaults. */
export function lobbySettings(options: unknown): LobbySettings {
  const raw = typeof options === 'object' && options !== null ? options as Record<string, unknown> : {};
  const name = typeof raw.name === 'string'
    ? raw.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LOBBY_LIMITS.nameLength)
    : '';
  const requested = typeof raw.maxDrivers === 'number' && Number.isFinite(raw.maxDrivers)
    ? Math.round(raw.maxDrivers)
    : RULES.maxDrivers;
  return {
    name: name || 'Scrapyard lobby',
    maxDrivers: Math.max(LOBBY_LIMITS.minDrivers, Math.min(LOBBY_LIMITS.maxDrivers, requested)),
    bots: typeof raw.bots === 'boolean' ? raw.bots : true,
  };
}
