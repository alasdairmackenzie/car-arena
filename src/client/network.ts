import { Client, type Room } from '@colyseus/sdk';
import { ArenaState } from '../shared/state';
import type { CarInput } from '../shared/simulation';
import type { LobbySettings, LobbySummary } from '../shared/lobby';
import { emptyGame, isPowerUpKind, isRoundPhase, type GameSnapshot, type PlayerSnapshot } from '../shared/game';

export type LobbyTarget = { create: LobbySettings } | { join: string };

function gameUrl(path = ''): URL {
  return new URL(`/game${path}`, window.location.href);
}

export async function fetchLobbies(): Promise<LobbySummary[]> {
  const response = await fetch(gameUrl('/lobbies'), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Lobby list failed (${response.status})`);
  return await response.json() as LobbySummary[];
}

export class ArenaNetwork {
  private room?: Room<{ state: ArenaState }, ArenaState>;
  private disposed = false;
  private game = emptyGame();
  private previous: PlayerSnapshot[] = [];
  private receivedAt = 0;
  sessionId = '';
  roomId = '';
  connected = false;

  constructor(
    private readonly reportStatus: (message: string) => void,
    private readonly reportError: (message: string) => void,
  ) {}

  async connect(target: LobbyTarget): Promise<void> {
    this.reportStatus('Connecting to the lobby...');
    const endpoint = gameUrl();
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    const client = new Client(endpoint.href);
    const room = 'create' in target
      ? await client.create<ArenaState>('arena', target.create, ArenaState)
      : await client.joinById<ArenaState>(target.join, {}, ArenaState);
    if (this.disposed) {
      await room.leave();
      return;
    }
    this.room = room;
    room.reconnection.enabled = false;
    this.sessionId = room.sessionId;
    this.roomId = room.roomId;
    this.connected = true;
    room.onStateChange(state => {
      if (!isRoundPhase(state.phase)) throw new Error(`Unknown round phase: ${state.phase}`);
      this.previous = this.sample();
      this.game = {
        players: [...state.players].map(([id, player]) => ({
          id, x: player.x, y: player.y, angle: player.angle,
          speed: player.speed, steering: player.steering, health: player.health,
          cores: player.cores, alive: player.alive,
          respawnTicks: player.respawnTicks, protectionTicks: player.protectionTicks,
          spectator: player.spectator, queuePosition: player.queuePosition,
          name: player.name, wins: player.wins,
          bot: player.bot,
          damageSequence: player.damageSequence, damageReason: player.damageReason,
          shieldTicks: player.shieldTicks, boostTicks: player.boostTicks, disruptor: player.disruptor,
        })),
        cores: [...state.cores].map(([id, core]) => ({ id, x: core.x, y: core.y })),
        powerUps: [...state.powerUps].map(([id, pickup]) => {
          if (!isPowerUpKind(pickup.kind)) throw new Error(`Unknown power-up: ${pickup.kind}`);
          return { id, x: pickup.x, y: pickup.y, kind: pickup.kind };
        }),
        projectiles: [...state.projectiles].map(([id, bullet]) => ({
          id, x: bullet.x, y: bullet.y, angle: bullet.angle, owner: bullet.owner,
        })),
        winner: state.winner, round: state.round, restartTicks: state.restartTicks,
        phase: state.phase, phaseTicks: state.phaseTicks,
        winnerName: state.winnerName, result: state.result,
        lobbyName: state.lobbyName, maxDrivers: state.maxDrivers, botsEnabled: state.botsEnabled,
      };
      this.receivedAt = performance.now();
    });
    room.onMessage<string>('notice', message => this.reportError(message));
    room.onMessage<string>('status', message => this.reportStatus(message));
    room.onError((code, message) => this.reportError(`Room error ${code}: ${message ?? 'Unknown error'}`));
    const disconnected = (code: number): void => {
      if (this.disposed || !this.connected) return;
      this.connected = false;
      this.game = emptyGame();
      this.previous = [];
      this.reportError(`Disconnected from arena (${code}). Reload to rejoin.`);
      this.reportStatus('Disconnected. Reload this page to rejoin.');
    };
    room.onLeave(disconnected);
    room.onDrop(disconnected);
    this.reportStatus('Joined the lobby. Your car is mint; other cars are coral.');
  }

  send(input: CarInput): void {
    const own = this.game.players.find(player => player.id === this.sessionId);
    if (this.connected && this.game.phase === 'active' && own && !own.spectator) this.room?.send('input', input);
  }

  authoritative(): PlayerSnapshot[] { return this.game.players; }
  snapshot(): GameSnapshot { return this.game; }

  sample(now = performance.now()): PlayerSnapshot[] {
    const alpha = Math.min(1, Math.max(0, (now - this.receivedAt) / 50));
    return this.game.players.map(car => {
      const previous = this.previous.find(old => old.id === car.id);
      if (!previous || previous.alive !== car.alive || previous.spectator !== car.spectator || Math.hypot(car.x - previous.x, car.y - previous.y) > 150) return { ...car };
      const angleDelta = Math.atan2(Math.sin(car.angle - previous.angle), Math.cos(car.angle - previous.angle));
      return {
        ...car,
        x: previous.x + (car.x - previous.x) * alpha,
        y: previous.y + (car.y - previous.y) * alpha,
        angle: previous.angle + angleDelta * alpha,
      };
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.connected = false;
    if (this.room) await this.room.leave();
  }
}
