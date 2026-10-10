import { Room, type Client } from '@colyseus/core';
import { ArenaState, PlayerState } from '../shared/state';
import { isCarInput } from '../shared/simulation';
import { ArenaSession, MAX_PLAYERS } from './session';

export class ArenaRoom extends Room<{ state: ArenaState }> {
  state = new ArenaState();
  maxClients = MAX_PLAYERS;
  maxMessagesPerSecond = 90;
  patchRate = 50;
  private readonly session = new ArenaSession();

  onCreate(): void {
    this.onMessage<unknown>('input', (client, input) => {
      if (!isCarInput(input)) {
        console.warn(`Invalid input from ${client.sessionId}`);
        client.send('notice', 'Invalid driving input rejected.');
        return;
      }
      this.session.input(client.sessionId, input);
    });
    this.onMessage('reset', client => {
      this.session.reset(client.sessionId);
      this.publish();
    });
    this.setFixedTimestep(() => {
      this.session.step();
      this.publish();
    }, 60);
  }

  onJoin(client: Client): void {
    this.session.join(client.sessionId);
    this.state.players.set(client.sessionId, new PlayerState());
    this.publish();
  }

  onLeave(client: Client): void {
    this.session.leave(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  private publish(): void {
    for (const car of this.session.simulation.snapshot()) {
      const player = this.state.players.get(car.id);
      if (!player) throw new Error(`Missing state for car ${car.id}`);
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      player.speed = car.speed;
      player.steering = car.steering;
    }
    this.state.tick = this.session.tick;
  }
}
