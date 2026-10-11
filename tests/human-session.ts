import { ArenaSession } from '../src/server/session';

// Isolate human combat/physics regression fixtures from autonomous opponents.
export class HumanTestSession extends ArenaSession {
  protected override fillBotSlots(): void {}

  protected override firstSpawn(): { x: number; y: number } {
    return { x: 720, y: 450 };
  }
}
