import type { GameSnapshot } from '../shared/game';

export function gameEvents(previous: GameSnapshot | undefined, game: GameSnapshot, ownId?: string): string[] {
  const events: string[] = [];
  if (!previous || previous.phase !== game.phase || previous.round !== game.round) {
    if (game.phase === 'countdown') events.push(`Round ${game.round} starting soon`);
    if (game.phase === 'active') events.push(`Round ${game.round} started — collect five cores`);
    if (game.phase === 'results') events.push(game.result === 'draw' ? 'Round ended in a draw' : `${game.winnerName} won the round`);
  }
  if (!previous || previous.round !== game.round || game.phase !== 'active' || previous.phase !== 'active') return events;
  for (const player of game.players) {
    const before = previous.players.find(candidate => candidate.id === player.id);
    if (!before || player.spectator) continue;
    const name = player.id === ownId ? 'You' : player.name;
    if (player.cores > before.cores) events.push(`${name} collected ${player.cores - before.cores} core${player.cores - before.cores > 1 ? 's' : ''}`);
    if (player.cores < before.cores) events.push(`${name} lost ${before.cores - player.cores} core${before.cores - player.cores > 1 ? 's' : ''}`);
    if (before.alive && !player.alive) events.push(`${name} wrecked`);
    else if (!before.alive && player.alive) events.push(`${name} back on the road`);
    else if (player.id === ownId && player.damageSequence > before.damageSequence) events.push(player.damageReason);
    if (player.shieldTicks > before.shieldTicks) events.push(`${name} picked up a shield`);
    if (player.boostTicks > before.boostTicks) events.push(`${name} picked up a speed boost`);
    if (!before.disruptor && player.disruptor) events.push(`${name} armed a disruptor`);
    if (before.shieldTicks > 0 && player.shieldTicks === 0 && player.alive) events.push(`${name} shield expired`);
    if (before.boostTicks > 0 && player.boostTicks === 0 && player.alive) events.push(`${name} speed boost expired`);
  }
  return events;
}

export class EventFeed {
  private previous?: GameSnapshot;
  private readonly entries: { node: HTMLElement; created: number }[] = [];

  constructor(private readonly container: HTMLElement) {}

  update(game: GameSnapshot, ownId: string | undefined, now: number, reducedMotion: boolean): void {
    for (const text of gameEvents(this.previous, game, ownId)) {
      const node = document.createElement('div');
      node.className = 'game-event';
      node.textContent = text;
      this.container.append(node);
      this.entries.push({ node, created: now });
    }
    this.previous = game;
    while (this.entries.length > 5 || (this.entries[0] && now - this.entries[0].created >= 7000)) {
      this.entries.shift()!.node.remove();
    }
    this.entries.forEach((entry, index) => {
      const age = now - entry.created;
      const position = this.entries.length - index - 1;
      entry.node.style.transform = `translateY(-${position * 28 + (reducedMotion ? 0 : age / 700)}px)`;
      entry.node.style.opacity = String(Math.min(1, (7000 - age) / 2000) * (1 - position * 0.16));
    });
  }
}
