import { Client, type Room } from '@colyseus/sdk';
import { ArenaState } from '../shared/state';
import type { CarInput, CarSnapshot } from '../shared/simulation';

export class ArenaNetwork {
  private room?: Room<{ state: ArenaState }, ArenaState>;
  private disposed = false;
  private current: CarSnapshot[] = [];
  private previous: CarSnapshot[] = [];
  private receivedAt = 0;
  sessionId = '';
  roomId = '';
  connected = false;

  constructor(
    private readonly reportStatus: (message: string) => void,
    private readonly reportError: (message: string) => void,
  ) {}

  async connect(): Promise<void> {
    this.reportStatus('Connecting to the shared arena...');
    const endpoint = new URL('/game', window.location.href);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    const room = await new Client(endpoint.href).joinOrCreate<ArenaState>('arena', {}, ArenaState);
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
      this.previous = this.sample();
      this.current = [...state.players].map(([id, player]) => ({
        id, x: player.x, y: player.y, angle: player.angle,
        speed: player.speed, steering: player.steering,
      }));
      this.receivedAt = performance.now();
    });
    room.onMessage<string>('notice', message => this.reportError(message));
    room.onError((code, message) => this.reportError(`Room error ${code}: ${message ?? 'Unknown error'}`));
    const disconnected = (code: number): void => {
      if (this.disposed || !this.connected) return;
      this.connected = false;
      this.current = [];
      this.previous = [];
      this.reportError(`Disconnected from arena (${code}). Reload to rejoin.`);
      this.reportStatus('Disconnected. Reload this page to rejoin.');
    };
    room.onLeave(disconnected);
    room.onDrop(disconnected);
    this.reportStatus(`Joined room ${room.roomId}. Your car is mint; other cars are coral.`);
  }

  send(input: CarInput): void {
    if (this.connected) this.room?.send('input', input);
  }

  reset(): void {
    if (this.connected) this.room?.send('reset');
  }

  authoritative(): CarSnapshot[] { return this.current; }

  sample(now = performance.now()): CarSnapshot[] {
    const alpha = Math.min(1, Math.max(0, (now - this.receivedAt) / 50));
    return this.current.map(car => {
      const previous = this.previous.find(old => old.id === car.id);
      if (!previous || Math.hypot(car.x - previous.x, car.y - previous.y) > 150) return { ...car };
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
