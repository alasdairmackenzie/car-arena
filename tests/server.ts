import { ArenaRoom } from '../src/server/room';
import { HumanTestSession as ArenaSession } from './human-session';
import { createGameServer } from '../src/server/server';
import type { LobbySettings } from '../src/shared/lobby';

function testRandom(): () => number {
  // Reproducible names and first pickup for real-keyboard combat tests.
  // All production timers, spawn spacing, expiry and gameplay rules are unchanged.
  const opening = [
    0.1, 0.1, 0.2, 0.2,
    0.5, 70 / 740, 0.5,
    0.1, 0.1, 0.5,
    0.9, 0.9, 0.5,
    0.5,
    0.5, 300 / 740, 0.5,
    0.6, 0.6, 0.5,
    0.3, 0.7, 0.5,
  ];
  let index = 0;
  let seed = 12345;
  return () => {
    if (index < opening.length) return opening[index++];
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

class TestArenaRoom extends ArenaRoom {
  protected override createSession(settings: LobbySettings): ArenaSession {
    return new ArenaSession(testRandom(), settings);
  }
}

await createGameServer(TestArenaRoom).listen(2677, '127.0.0.1');
