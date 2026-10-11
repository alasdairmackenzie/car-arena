import { Room, type Client } from '@colyseus/core';
import { ArenaState, CoreState, PlayerState, PowerUpState, ProjectileState } from '../shared/state';
import { isCarInput } from '../shared/simulation';
import { ArenaSession, MAX_CONNECTIONS } from './session';
import { lobbySettings, type LobbySettings } from '../shared/lobby';

export class ArenaRoom extends Room<{ state: ArenaState }> {
  state = new ArenaState();
  maxClients = MAX_CONNECTIONS;
  maxMessagesPerSecond = 90;
  patchRate = 50;
  protected session!: ArenaSession;

  protected createSession(settings: LobbySettings): ArenaSession {
    return new ArenaSession(Math.random, settings);
  }

  onCreate(options: unknown): void {
    this.session = this.createSession(lobbySettings(options));
    this.updateLobbyMetadata();
    this.onMessage<unknown>('input', (client, input) => {
      if (!isCarInput(input)) {
        console.warn(`Invalid input from ${client.sessionId}`);
        client.send('notice', 'Invalid driving input rejected.');
        return;
      }
      this.session.input(client.sessionId, input);
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
    this.updateLobbyMetadata();
  }

  onLeave(client: Client): void {
    this.session.leave(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.updateLobbyMetadata();
  }

  private updateLobbyMetadata(): void {
    const { name, maxDrivers, bots } = this.session.settings;
    const humans = [...this.session.players.values()].filter(player => !player.bot).length;
    this.setMetadata({ name, maxDrivers, bots, humans }).catch(cause => console.error('Could not update lobby metadata', cause));
  }

  private publish(): void {
    const game = this.session.snapshot();
    for (const id of this.state.players.keys()) {
      if (!this.session.players.has(id)) this.state.players.delete(id);
    }
    for (const { id, ...fields } of game.players) {
      if (!this.state.players.has(id)) this.state.players.set(id, new PlayerState());
      const player = this.state.players.get(id);
      if (!player) throw new Error(`Missing state for car ${id}`);
      Object.assign(player, fields);
    }
    for (const id of this.state.cores.keys()) {
      if (!this.session.cores.has(id)) this.state.cores.delete(id);
    }
    for (const { id, ...fields } of game.cores) {
      if (!this.state.cores.has(id)) this.state.cores.set(id, new CoreState());
      Object.assign(this.state.cores.get(id)!, fields);
    }
    for (const id of this.state.projectiles.keys()) {
      if (!this.session.projectiles.has(id)) this.state.projectiles.delete(id);
    }
    for (const id of this.state.powerUps.keys()) {
      if (!this.session.powerUps.has(id)) this.state.powerUps.delete(id);
    }
    for (const { id, ...fields } of game.powerUps) {
      if (!this.state.powerUps.has(id)) this.state.powerUps.set(id, new PowerUpState());
      Object.assign(this.state.powerUps.get(id)!, fields);
    }
    for (const { id, ...fields } of game.projectiles) {
      if (!this.state.projectiles.has(id)) this.state.projectiles.set(id, new ProjectileState());
      Object.assign(this.state.projectiles.get(id)!, fields);
    }
    this.state.winner = game.winner;
    this.state.round = game.round;
    this.state.restartTicks = game.restartTicks;
    this.state.phase = game.phase;
    this.state.phaseTicks = game.phaseTicks;
    this.state.winnerName = game.winnerName;
    this.state.result = game.result;
    this.state.lobbyName = game.lobbyName;
    this.state.maxDrivers = game.maxDrivers;
    this.state.botsEnabled = game.botsEnabled;
    this.state.tick = this.session.tick;
  }
}
