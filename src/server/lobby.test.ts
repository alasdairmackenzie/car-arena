import { describe, expect, it } from 'vitest';
import { ArenaSession } from './session';
import { LOBBY_LIMITS, lobbySettings } from '../shared/lobby';
import { RULES } from '../shared/game';

function seeded(): () => number {
  let seed = 7;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function startRound(game: ArenaSession): void {
  for (let i = 0; i <= RULES.countdownTicks; i++) game.step();
}

describe('lobby settings', () => {
  it('defaults, clamps and sanitises untrusted options', () => {
    expect(lobbySettings(undefined)).toEqual({ name: 'Scrapyard lobby', maxDrivers: 5, bots: true });
    expect(lobbySettings({ maxDrivers: 99 }).maxDrivers).toBe(LOBBY_LIMITS.maxDrivers);
    expect(lobbySettings({ maxDrivers: 0 }).maxDrivers).toBe(LOBBY_LIMITS.minDrivers);
    expect(lobbySettings({ maxDrivers: '7' }).maxDrivers).toBe(5);
    expect(lobbySettings({ bots: false }).bots).toBe(false);
    expect(lobbySettings({ bots: 'no' }).bots).toBe(true);
    const name = lobbySettings({ name: `  \u0007Rust${'x'.repeat(40)}  ` }).name;
    expect(name.startsWith('Rust')).toBe(true);
    expect(name.length).toBeLessThanOrEqual(LOBBY_LIMITS.nameLength);
    expect(lobbySettings({ name: '   ' }).name).toBe('Scrapyard lobby');
  });
});

describe('lobby-configured sessions', () => {
  it('fills a ten-driver lobby with bots around one human', () => {
    const game = new ArenaSession(seeded(), { maxDrivers: 10, bots: true });
    game.join('human');
    startRound(game);
    expect(game.simulation.cars.size).toBe(10);
    expect(game.snapshot()).toMatchObject({ maxDrivers: 10, botsEnabled: true });
  });

  it('never adds bots when AI is disabled and caps humans at the lobby size', () => {
    const game = new ArenaSession(seeded(), { name: 'Humans only', maxDrivers: 2, bots: false });
    for (const id of ['a', 'b', 'c']) game.join(id);
    startRound(game);
    const snapshot = game.snapshot();
    expect(snapshot.players.some(player => player.bot)).toBe(false);
    expect(game.simulation.cars.size).toBe(2);
    expect(snapshot).toMatchObject({ lobbyName: 'Humans only', maxDrivers: 2, botsEnabled: false });
  });
});
