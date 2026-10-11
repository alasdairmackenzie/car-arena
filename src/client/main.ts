import Phaser from 'phaser';
import { ARENA, CAR, Simulation, STEP_MS, HANDLING, type CarSnapshot } from '../shared/simulation';
import { DrivingInput } from './input';
import { TouchInput } from './touch';
import { drawScrapyard, ScrapyardEffects } from './scrapyard';
import { EventFeed } from './events';
import { ArenaNetwork, fetchLobbies, type LobbyTarget } from './network';
import { LOBBY_LIMITS } from '../shared/lobby';
import { emptyGame, RULES, type GameSnapshot, type PlayerSnapshot } from '../shared/game';
import './style.css';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
}

const arena = element('game');
const speed = element('speed');
const status = element('status');
const error = element('error');
const errorDialog = element<HTMLDialogElement>('error-dialog');
const players = element('players');
const health = element<HTMLProgressElement>('health');
const coreProgress = element<HTMLProgressElement>('core-progress');
const standings = element('standings');
const banner = element('banner');
const damageFlash = element('damage-flash');
const announce = element('announce');
const announceKicker = element('announce-kicker');
const announceMain = element('announce-main');
const announceSub = element('announce-sub');
const timer = element('timer');
const timerLabel = element('timer-label');
const ourScore = element('our-score');
const ourName = element('our-name');
const winTotal = element('win-total');
const powerUpStatus = element('power-up-status');
const solo = new URLSearchParams(window.location.search).get('solo') === '1';
const mobile = window.matchMedia('(max-width: 600px), (pointer: coarse)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const menu = element<HTMLDialogElement>('game-menu');
const play = element<HTMLButtonElement>('play');
const help = element<HTMLButtonElement>('help');
const mainMenu = element<HTMLButtonElement>('main-menu');
const lobbyPicker = element('lobby-picker');
const lobbyList = element<HTMLUListElement>('lobby-list');
const lobbyEmpty = element('lobby-empty');
const lobbyRefresh = element<HTMLButtonElement>('lobby-refresh');
const lobbyForm = element<HTMLFormElement>('lobby-create');
const lobbyMaxDrivers = lobbyForm.elements.namedItem('maxDrivers') as HTMLSelectElement;
for (let count = LOBBY_LIMITS.minDrivers; count <= LOBBY_LIMITS.maxDrivers; count++) {
  lobbyMaxDrivers.add(new Option(String(count), String(count), count === RULES.maxDrivers, count === RULES.maxDrivers));
}
lobbyPicker.hidden = solo;
play.hidden = !solo;
const minimap = element<HTMLCanvasElement>('minimap');
const mapContext = minimap.getContext('2d');
if (!mapContext) throw new Error('Could not create minimap canvas');
element('mode').textContent = solo ? 'SOLO PLAYGROUND' : 'SHARED ARENA';
element('combat-hud').hidden = solo;
element('objective').hidden = solo;
element('fire-controls').hidden = solo;
if (solo) element('touch-controls').querySelector<HTMLButtonElement>('[data-drive="fire"]')!.hidden = true;

function reportError(message: string): void {
  console.error(message);
  error.hidden = false;
  error.textContent = message;
  if (!errorDialog.open) errorDialog.showModal();
}

errorDialog.addEventListener('close', () => {
  error.hidden = true;
  error.textContent = '';
  if (menu.open) (lobbyPicker.hidden ? play : lobbyRefresh).focus();
  else arena.focus();
});

function resultTitle(game: GameSnapshot, own?: PlayerSnapshot): string {
  if (game.result === 'draw') return 'Draw!';
  return game.winner === own?.id ? 'You win!' : `${game.winnerName} wins!`;
}

function resultDetail(game: GameSnapshot): string {
  return game.result === 'draw' ? 'Equal top scores.'
    : game.result === 'timeout' ? 'Highest score at the time limit.' : 'Five cores collected.';
}

class ArenaScene extends Phaser.Scene {
  private readonly simulation = solo ? new Simulation() : undefined;
  private readonly network = solo ? undefined : new ArenaNetwork(
    message => { status.textContent = message; },
    reportError,
  );
  private graphics!: Phaser.GameObjects.Graphics;
  private inputController!: DrivingInput;
  private touchController!: TouchInput;
  private accumulator = 0;
  private telemetryElapsed = 0;
  private networkElapsed = 0;
  private lastAnnouncement = '';
  private lastBigText = '';
  private lastDamageSequence?: number;
  private damageFlashUntil = 0;
  private damageAnimation?: Animation;
  private readonly effects = new ScrapyardEffects();
  private previousVisualPlayers = new Map<string, PlayerSnapshot>();
  private started = false;
  private readonly eventFeed = new EventFeed(element('event-feed'));
  private readonly carLabels = new Map<string, Phaser.GameObjects.Text>();
  private lobbyPoll = 0;
  private lobbyRequest = 0;

  constructor() { super('arena'); }

  create(): void {
    this.simulation?.addCar('local');
    drawScrapyard(this);
    this.graphics = this.add.graphics();
    arena.dataset.theme = 'neon-scrapyard';
    this.inputController = new DrivingInput(arena);
    this.touchController = new TouchInput(element('touch-controls'), element('steering-pad'), () => arena.focus());
    const resizeObserver = new ResizeObserver(() => {
      this.scale.getParentBounds();
      this.scale.refresh();
      const game = this.network?.snapshot() ?? emptyGame();
      const ownId = solo ? 'local' : this.network?.sessionId;
      const own = (this.simulation?.snapshot() ?? game.players).find(car => car.id === ownId);
      this.updateCamera(own, game.players.find(player => player.id === ownId));
    });
    resizeObserver.observe(arena);
    play.addEventListener('click', this.startPlaying);
    mainMenu.addEventListener('click', this.backToMainMenu);
    help.addEventListener('click', this.openMenu);
    menu.addEventListener('close', this.closeMenu);
    lobbyList.addEventListener('click', this.joinLobby);
    lobbyRefresh.addEventListener('click', this.refreshLobbies);
    lobbyForm.addEventListener('submit', this.createLobby);
    menu.showModal();
    if (!solo) {
      this.refreshLobbies();
      this.lobbyPoll = window.setInterval(() => {
        if (menu.open && !this.started) this.refreshLobbies();
      }, 3000);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      resizeObserver.disconnect();
      this.damageAnimation?.cancel();
      this.inputController.destroy();
      this.touchController.destroy();
      play.removeEventListener('click', this.startPlaying);
      mainMenu.removeEventListener('click', this.backToMainMenu);
      help.removeEventListener('click', this.openMenu);
      menu.removeEventListener('close', this.closeMenu);
      lobbyList.removeEventListener('click', this.joinLobby);
      lobbyRefresh.removeEventListener('click', this.refreshLobbies);
      lobbyForm.removeEventListener('submit', this.createLobby);
      window.clearInterval(this.lobbyPoll);
      menu.close();
      this.network?.dispose().catch(cause => reportError(`Could not leave the room: ${String(cause)}`));
    });
  }

  private readonly openMenu = (): void => { menu.showModal(); };
  private readonly backToMainMenu = (): void => { window.location.reload(); };
  private readonly closeMenu = (): void => {
    if (errorDialog.open) element('error-continue').focus();
    else if (this.started) arena.focus();
    else help.focus();
  };
  private readonly refreshLobbies = (): void => {
    const request = ++this.lobbyRequest;
    fetchLobbies().then(lobbies => {
      if (request !== this.lobbyRequest || this.started) return;
      const focusedRoom = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.room : undefined;
      lobbyList.replaceChildren(...lobbies.map(lobby => {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.className = 'lobby-name';
        name.textContent = lobby.name;
        const meta = document.createElement('span');
        meta.className = 'lobby-meta';
        const full = lobby.humans >= lobby.maxDrivers;
        meta.textContent = `${lobby.humans} / ${lobby.maxDrivers} drivers \u00b7 AI ${lobby.bots ? 'on' : 'off'}${full ? ' \u00b7 full, spectate and queue' : ''}`;
        const join = document.createElement('button');
        join.type = 'button';
        join.dataset.room = lobby.roomId;
        join.textContent = full ? 'Spectate' : 'Join';
        join.setAttribute('aria-label', `${join.textContent} ${lobby.name}`);
        item.append(name, meta, join);
        return item;
      }));
      if (focusedRoom) lobbyList.querySelector<HTMLButtonElement>(`button[data-room="${CSS.escape(focusedRoom)}"]`)?.focus();
      lobbyEmpty.hidden = lobbies.length > 0;
      lobbyList.dataset.state = 'ready';
    }).catch(cause => {
      if (request !== this.lobbyRequest) return;
      lobbyList.dataset.state = 'error';
      lobbyEmpty.hidden = false;
      lobbyEmpty.textContent = `Could not load lobbies: ${cause instanceof Error ? cause.message : String(cause)}. You can still create one.`;
    });
  };

  private readonly joinLobby = (event: Event): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-room]');
    if (button?.dataset.room) this.startOnline({ join: button.dataset.room });
  };

  private readonly createLobby = (event: SubmitEvent): void => {
    event.preventDefault();
    const data = new FormData(lobbyForm);
    this.startOnline({ create: {
      name: String(data.get('name') ?? ''),
      maxDrivers: Number(data.get('maxDrivers')),
      bots: data.get('bots') === 'on',
    } });
  };

  private readonly startPlaying = (): void => {
    if (!this.started && solo) {
      this.markStarted();
      element('menu-note').textContent = 'Solo playground: practise driving at your own pace.';
      status.textContent = 'Ready. Focus the arena, then drive.';
    }
    menu.close();
  };

  private markStarted(): void {
    this.started = true;
    window.clearInterval(this.lobbyPoll);
    arena.dataset.started = 'true';
    document.querySelector('main')?.classList.add('playing');
    lobbyPicker.hidden = true;
    play.hidden = false;
    play.textContent = 'Back to game';
    help.textContent = 'Game menu';
    mainMenu.hidden = false;
    element('menu-title').textContent = 'Game menu';
    element('menu-note').textContent = 'The online round keeps running while this menu is open.';
  }

  private startOnline(target: LobbyTarget): void {
    if (this.started || !this.network) return;
    this.markStarted();
    this.network.connect(target).catch(cause => {
      status.textContent = 'Connection failed. No local fallback is running.';
      this.returnToPicker();
      reportError(`Could not join the arena: ${cause instanceof Error ? cause.message : String(cause)}. Pick another lobby or create one.`);
    });
    menu.close();
  }

  private returnToPicker(): void {
    this.started = false;
    delete arena.dataset.started;
    document.querySelector('main')?.classList.remove('playing');
    lobbyPicker.hidden = false;
    play.hidden = true;
    mainMenu.hidden = true;
    help.textContent = 'Play / how to play';
    element('menu-title').textContent = 'Welcome to the scrapyard';
    element('menu-note').textContent = "Pick a lobby or create your own. You won't join a round until then.";
    this.refreshLobbies();
    this.lobbyPoll = window.setInterval(() => {
      if (menu.open && !this.started) this.refreshLobbies();
    }, 3000);
    if (!menu.open) menu.showModal();
  }

  update(_time: number, delta: number): void {
    const currentGame = this.network?.snapshot() ?? emptyGame();
    const currentOwn = currentGame.players.find(player => player.id === this.network?.sessionId);
    this.touchController.setEnabled(this.started && !menu.open && !errorDialog.open && (solo || Boolean(this.network?.connected && currentGame.phase === 'active' && currentOwn?.alive && !currentOwn.spectator)));
    const keyboard = this.inputController.read();
    const touch = this.touchController.read();
    const controls = {
      throttle: Math.max(-1, Math.min(1, keyboard.throttle + touch.throttle)),
      steering: Math.max(-1, Math.min(1, keyboard.steering + touch.steering)),
      handbrake: keyboard.handbrake || touch.handbrake,
      fire: keyboard.fire || touch.fire,
    };
    if (this.simulation) {
      if (!this.started) return;
      this.accumulator += Math.min(delta, 250);
      while (this.accumulator >= STEP_MS) {
        this.simulation.setInput('local', controls);
        this.simulation.step();
        this.accumulator -= STEP_MS;
      }
    } else {
      this.networkElapsed += delta;
      if (this.networkElapsed >= 50) {
        this.networkElapsed = 0;
        this.network?.send(controls);
      }
    }
    const cars = this.simulation?.snapshot() ?? this.network?.sample() ?? [];
    const authoritative = this.simulation?.snapshot() ?? this.network?.authoritative() ?? [];
    const ownId = solo ? 'local' : this.network?.sessionId;
    const own = authoritative.find(car => car.id === ownId);
    const game = this.network?.snapshot() ?? emptyGame();
    const combatOwn = game.players.find(car => car.id === ownId);
    if (combatOwn && this.lastDamageSequence !== combatOwn.damageSequence) {
      if (this.lastDamageSequence !== undefined && combatOwn.damageSequence > this.lastDamageSequence) {
        damageFlash.textContent = combatOwn.alive ? combatOwn.damageReason : "You've been scrapped";
        damageFlash.dataset.kind = combatOwn.alive ? 'hit' : 'scrapped';
        this.damageFlashUntil = performance.now() + 1600;
        damageFlash.hidden = false;
        this.damageAnimation?.cancel();
        if (!reducedMotion.matches) {
          this.damageAnimation = damageFlash.animate([
            { transform: 'translate(-50%, -50%) scale(1.35) rotate(-3deg)', offset: 0 },
            { transform: 'translate(-50%, -50%) scale(0.96) rotate(1deg)', offset: 0.65 },
            { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', offset: 1 },
          ], { duration: 320, easing: 'ease-out' });
          this.cameras.main.shake(180, 0.003, false);
        }
      }
      this.lastDamageSequence = combatOwn.damageSequence;
    }
    const flashRemaining = this.damageFlashUntil - performance.now();
    damageFlash.hidden = flashRemaining <= 0 || !this.network?.connected || Boolean(combatOwn?.spectator);
    if (damageFlash.hidden || reducedMotion.matches) this.damageAnimation?.cancel();
    damageFlash.style.opacity = String(Math.min(1, Math.max(0, flashRemaining / 400)));
    const camera = this.cameras.main;
    const following = this.updateCamera(own, combatOwn);
    const g = this.graphics;
    g.clear();
    for (const player of game.players) {
      const previous = this.previousVisualPlayers.get(player.id);
      if (previous && !player.spectator && !reducedMotion.matches) {
        if (player.cores > previous.cores) this.effects.burst(player.x, player.y, 0xffd166);
        if (player.damageSequence > previous.damageSequence) this.effects.burst(player.x, player.y, 0xff917e);
      }
    }
    this.previousVisualPlayers = new Map(game.players.map(player => [player.id, player]));
    for (const core of game.cores) {
      const glow = reducedMotion.matches ? 0.14 : 0.12 + Math.sin(_time / 700 + core.x) * 0.04;
      g.fillStyle(0xffd166, glow).fillCircle(core.x, core.y, 30);
      g.lineStyle(1, 0xffd166, 0.35).strokeCircle(core.x, core.y, 21);
      g.fillStyle(0x594927, 0.8).fillCircle(core.x, core.y, 17);
      g.fillStyle(0xffd166).fillPoints([
        { x: core.x, y: core.y - 14 }, { x: core.x + 12, y: core.y - 7 },
        { x: core.x + 12, y: core.y + 7 }, { x: core.x, y: core.y + 14 },
        { x: core.x - 12, y: core.y + 7 }, { x: core.x - 12, y: core.y - 7 },
      ], true);
      g.fillStyle(0xfff3c4).fillCircle(core.x, core.y, 4);
      g.lineStyle(2, 0x8d632a).lineBetween(core.x - 6, core.y + 8, core.x + 6, core.y + 8);
    }
    for (const pickup of game.powerUps) {
      const color = pickup.kind === 'shield' ? 0x67e8f9 : pickup.kind === 'speed' ? 0xa3e635 : pickup.kind === 'damage' ? 0xff6b70 : 0xd8a0ff;
      g.fillStyle(color, 0.09).fillCircle(pickup.x, pickup.y, 31);
      g.fillStyle(0x070e14, 0.8).fillRoundedRect(pickup.x - 20, pickup.y - 20, 40, 40, 8);
      g.lineStyle(3, color).strokeRoundedRect(pickup.x - 20, pickup.y - 20, 40, 40, 8);
      if (pickup.kind === 'shield') {
        g.lineStyle(4, color).strokeCircle(pickup.x, pickup.y, 11);
      } else if (pickup.kind === 'speed') {
        for (const offset of [-6, 6]) {
          g.lineStyle(3, color).lineBetween(pickup.x - 7, pickup.y + offset + 4, pickup.x, pickup.y + offset - 4);
          g.lineBetween(pickup.x, pickup.y + offset - 4, pickup.x + 7, pickup.y + offset + 4);
        }
      } else if (pickup.kind === 'damage') {
        g.lineStyle(4, color).lineBetween(pickup.x - 9, pickup.y - 9, pickup.x + 9, pickup.y + 9);
        g.lineBetween(pickup.x + 9, pickup.y - 9, pickup.x - 9, pickup.y + 9);
      } else {
        g.lineStyle(3, color).lineBetween(pickup.x - 12, pickup.y, pickup.x + 12, pickup.y);
        g.strokeCircle(pickup.x, pickup.y, 6);
      }
    }
    for (const car of cars) {
      const combat = game.players.find(player => player.id === car.id);
      if (combat?.spectator) continue;
      if (!combat || combat.alive) this.drawCar(car, car.id === ownId, combat);
      else {
        g.lineStyle(3, 0xff917e, 0.4);
        g.lineBetween(car.x - 15, car.y - 15, car.x + 15, car.y + 15);
        g.lineBetween(car.x + 15, car.y - 15, car.x - 15, car.y + 15);
      }
    }
    const labelledCars = new Set<string>();
    for (const car of cars) {
      const player = game.players.find(candidate => candidate.id === car.id);
      if (player?.spectator || player?.alive === false) continue;
      labelledCars.add(car.id);
      let label = this.carLabels.get(car.id);
      if (!label) {
        label = this.add.text(0, 0, '', {
          fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold',
          backgroundColor: '#0b1119', padding: { x: 5, y: 3 },
        }).setOrigin(0.5, 1).setDepth(10);
        this.carLabels.set(car.id, label);
      }
      const ownCar = car.id === ownId;
      label.setText(player?.name ?? 'You').setColor(ownCar ? '#a3ffce' : '#ffd0c5');
      const scale = 1 / camera.zoom;
      label.setScale(scale);
      const statusHeight = player ? 20 * scale : 0;
      const labelY = car.y - 36 - 6 * scale - statusHeight;
      const halfWidth = label.displayWidth / 2;
      label.setPosition(
        Phaser.Math.Clamp(car.x, halfWidth, ARENA.width - halfWidth),
        Math.max(label.displayHeight, labelY),
      );
      if (player) this.drawCarStatus(label.x, label.y + 3 * scale, scale, player);
    }
    for (const [id, label] of this.carLabels) {
      if (!labelledCars.has(id)) {
        label.destroy();
        this.carLabels.delete(id);
      }
    }
    for (const bullet of game.projectiles) {
      g.lineStyle(8, 0xffd166, 0.18).lineBetween(
        bullet.x - Math.cos(bullet.angle) * 18,
        bullet.y - Math.sin(bullet.angle) * 18, bullet.x, bullet.y);
      g.lineStyle(4, 0xe9f5ff).lineBetween(
        bullet.x - Math.cos(bullet.angle) * 12,
        bullet.y - Math.sin(bullet.angle) * 12, bullet.x, bullet.y);
    }
    this.effects.draw(g, delta, reducedMotion.matches);
    this.telemetryElapsed += delta;
    if (this.telemetryElapsed >= 100) {
      this.telemetryElapsed = 0;
      speed.textContent = `${Math.round(own?.speed ?? 0)} px/s`;
      const driverCount = solo ? Number(this.started) : game.players.filter(player => !player.spectator).length;
      players.textContent = solo ? '1 driver' : `${driverCount} / ${game.maxDrivers} drivers (${game.players.filter(player => player.bot).length} bots) / ${game.players.length - driverCount} spectators`;
      arena.dataset.x = String(own?.x ?? 0);
      arena.dataset.y = String(own?.y ?? 0);
      arena.dataset.angle = String(own?.angle ?? 0);
      arena.dataset.speed = String(own?.speed ?? 0);
      arena.dataset.players = String(driverCount);
      arena.dataset.room = this.network?.roomId ?? 'solo';
      if (!solo && game.lobbyName && arena.dataset.lobby !== game.lobbyName) {
        arena.dataset.lobby = game.lobbyName;
        element('menu-note').textContent = `Lobby: ${game.lobbyName} (${game.maxDrivers} drivers, AI ${game.botsEnabled ? 'on' : 'off'}). The round keeps running while this menu is open.`;
      }
      arena.dataset.player = ownId ?? '';
      arena.dataset.state = JSON.stringify(authoritative.filter(car => !('spectator' in car) || !car.spectator));
      arena.dataset.connected = String(this.started && (solo || Boolean(this.network?.connected)));
      arena.dataset.game = JSON.stringify(game);
      arena.dataset.camera = following ? 'follow' : 'overview';
      arena.dataset.cameraZoom = String(camera.zoom);
      arena.dataset.labels = JSON.stringify([...this.carLabels].map(([id, label]) => ({ id, name: label.text, x: label.x, y: label.y })));
      this.drawMinimap(game, authoritative, ownId);
      if (!solo && this.started) {
        this.updateHud(game, combatOwn);
        this.eventFeed.update(game, ownId, performance.now(), reducedMotion.matches);
      }
    }
  }

  private drawMinimap(game: GameSnapshot, cars: CarSnapshot[], ownId?: string): void {
    const context = mapContext!;
    context.clearRect(0, 0, minimap.width, minimap.height);
    context.fillStyle = '#101820';
    context.fillRect(0, 0, minimap.width, minimap.height);
    const sx = minimap.width / ARENA.width;
    const sy = minimap.height / ARENA.height;
    const dot = (x: number, y: number, color: string, radius: number): void => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(x * sx, y * sy, radius, 0, Math.PI * 2);
      context.fill();
    };
    for (const core of game.cores) dot(core.x, core.y, '#ffd166', 2);
    for (const pickup of game.powerUps) dot(pickup.x, pickup.y, pickup.kind === 'damage' ? '#ff6b70' : '#67e8f9', 2);
    for (const car of cars) {
      const player = game.players.find(player => player.id === car.id);
      if (player?.spectator || player?.alive === false) continue;
      dot(car.x, car.y, car.id === ownId ? '#72e4b0' : '#ff917e', car.id === ownId ? 4 : 3);
    }
    const view = this.cameras.main.worldView;
    context.strokeStyle = '#e6eef3';
    context.lineWidth = 1;
    context.strokeRect(view.x * sx, view.y * sy, view.width * sx, view.height * sy);
  }

  private updateCamera(own?: CarSnapshot, combatOwn?: PlayerSnapshot): boolean {
    const camera = this.cameras.main;
    const following = Boolean(mobile.matches && own && !combatOwn?.spectator);
    if (following && own) {
      camera.setBounds(0, 0, ARENA.width, ARENA.height);
      camera.setZoom(1);
      camera.centerOn(own.x, own.y);
    } else {
      camera.removeBounds();
      camera.setZoom(Math.min(camera.width / ARENA.width, camera.height / ARENA.height));
      camera.centerOn(ARENA.width / 2, ARENA.height / 2);
    }
    return following;
  }

  private renderAnnouncement(game: GameSnapshot, own: PlayerSnapshot | undefined, seconds: number): void {
    const kind = game.phase === 'countdown' ? 'countdown'
      : game.phase === 'results' ? (game.result !== 'draw' && game.winner === own?.id ? 'win' : 'results')
      : '';
    announce.hidden = !kind;
    if (!kind) {
      this.lastBigText = '';
      return;
    }
    announce.dataset.kind = kind;
    const main = kind === 'countdown' ? String(Math.max(1, seconds)) : resultTitle(game, own);
    announceKicker.textContent = kind === 'countdown' ? `Round ${game.round} starts in` : `Round ${game.round} over`;
    announceSub.textContent = kind === 'countdown'
      ? own?.spectator ? `Spectating \u00b7 queue #${own.queuePosition}` : ''
      : `${resultDetail(game)} Next round in ${seconds}s.`;
    if (main !== this.lastBigText) {
      this.lastBigText = main;
      announceMain.textContent = main;
      if (!reducedMotion.matches) {
        announceMain.animate(
          [{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
          { duration: 280, easing: 'cubic-bezier(.2,.9,.3,1.3)' },
        );
      }
    }
  }

  private updateHud(game: GameSnapshot, own?: PlayerSnapshot): void {
    health.value = own?.health ?? 0;
    coreProgress.value = own?.cores ?? 0;
    const effects = [
      own && own.shieldTicks > 0 ? `Shield ${Math.ceil(own.shieldTicks / 60)}s` : '',
      own && own.boostTicks > 0 ? `Speed boost ${Math.ceil(own.boostTicks / 60)}s` : '',
      own?.disruptor ? 'Disruptor ready' : '',
    ].filter(Boolean);
    powerUpStatus.textContent = effects.length ? effects.join(' / ') : 'No active power-ups';
    const seconds = Math.ceil(game.phaseTicks / 60);
    timer.textContent = game.phase === 'waiting' ? '--:--' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    timerLabel.textContent = game.phase === 'active' ? 'TIME LEFT' :
      game.phase === 'countdown' ? 'STARTS IN' : game.phase === 'results' ? 'NEXT ROUND' : 'WAITING';
    ourName.textContent = own?.name ?? 'Connecting...';
    ourScore.textContent = own?.spectator ? `QUEUE #${own.queuePosition}` : `${own?.cores ?? 0} / 5 CORES`;
    winTotal.textContent = `${own?.wins ?? 0} total wins`;
    this.renderAnnouncement(game, own, seconds);
    const message = game.phase === 'waiting' ? 'Waiting for a driver to join...'
      : game.phase === 'results' || game.phase === 'countdown' ? ''
      : own?.spectator ? `Spectating. Queue #${own.queuePosition} for a future round.`
      : own && !own.alive
        ? own.respawnTicks > 0 ? `Destroyed. Respawning in ${Math.ceil(own.respawnTicks / 60)}s.` : 'Waiting for a clear spawn...'
        : own && own.protectionTicks > 0 ? 'Spawn protection: no damage or firing for 2 seconds.' : '';
    banner.textContent = message;
    banner.hidden = !message;
    const leaderboard = [...game.players]
      .sort((a, b) => Number(a.spectator) - Number(b.spectator) || b.cores - a.cores)
      .map(player => `${player.name}${player.id === own?.id ? ' (you)' : ''}: ${player.spectator ? `queue #${player.queuePosition}` : `${player.cores}/5`} / ${player.wins} wins${player.alive || player.spectator ? '' : ' (respawning)'}`)
      .join(' | ');
    standings.textContent = leaderboard;
    const announcement = `${game.phase}:${game.round}:${own?.spectator}:${own?.queuePosition}:${own?.alive}:${own?.cores}:${own?.health}:${Boolean(own?.shieldTicks)}:${Boolean(own?.boostTicks)}:${own?.disruptor}`;
    if (announcement !== this.lastAnnouncement && own) {
      this.lastAnnouncement = announcement;
      status.textContent = game.phase === 'waiting' ? 'Waiting for a driver to join. Bots fill empty race slots.'
        : game.phase === 'results' ? `${resultTitle(game, own)} ${resultDetail(game)}`
        : game.phase === 'countdown' ? `Round ${game.round} begins after the five-second countdown. ${own.spectator ? `Spectating; queue position ${own.queuePosition}.` : `Driving as ${own.name}.`}`
        : own.spectator ? `Spectating as ${own.name}. Queue position ${own.queuePosition} for the next available round.`
        : !own.alive ? 'Destroyed. All cores dropped; respawning in three seconds.'
        : `${own.name}. Round ${game.round}. You hold ${own.cores} of five gold cores. Health ${own.health}. Total wins ${own.wins}. ${powerUpStatus.textContent}. Room ${this.network?.roomId}.`;
    }
  }

  private drawCar(car: CarSnapshot, own: boolean, combat?: PlayerSnapshot): void {
    const g = this.graphics;
    g.save();
    g.translateCanvas(car.x, car.y);
    g.rotateCanvas(car.angle);
    g.fillStyle(0x070e14).fillRoundedRect(-CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width, 7);
    for (const x of [-22, 22]) {
      for (const y of [-17, 17]) {
        g.save();
        g.translateCanvas(x, y);
        if (x > 0) g.rotateCanvas(car.steering * HANDLING.steeringAngle);
        g.fillStyle(0x070e14).fillRect(-8, -4, 16, 8);
        g.restore();
      }
    }
    g.fillStyle(own ? 0x72e4b0 : 0xff917e).fillRoundedRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 7);
    g.lineStyle(2, 0x101820).strokeRoundedRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 7);
    g.fillStyle(0x22303a).fillRoundedRect(-10, -12, 23, 24, 3);
    g.lineStyle(1, 0x94b2bc, 0.65).lineBetween(-7, -9, 8, -9);
    g.fillStyle(0x0b1218).fillRect(14, -10, 10, 20);
    g.fillStyle(own ? 0x72e4b0 : 0xff917e, 0.7).fillRect(16, -8, 6, 16);
    g.fillStyle(0xc3c8c5).fillRect(-30, -13, 4, 26).fillRect(27, -13, 4, 26);
    g.lineStyle(2, 0x17232a).lineBetween(-23, -9, -15, -5).lineBetween(-21, 8, -14, 10);
    g.fillStyle(0x0a1117).fillRect(-25, -12, 3, 24);
    g.fillStyle(0xc69a44).fillRect(-20, -3, 5, 6);
    g.fillStyle(0xc4f9e1).fillRect(22, -12, 5, 8).fillRect(22, 4, 5, 8);
    g.fillStyle(0xff6b70).fillRect(-29, -12, 4, 7).fillRect(-29, 5, 4, 7);
    if (combat) g.fillStyle(0xdeeaf2).fillRect(15, -3, 22, 6);
    g.restore();
    if (combat) {
      if (combat.protectionTicks > 0) g.lineStyle(2, 0x82b6ff, 0.8).strokeCircle(car.x, car.y, 42);
      if (combat.shieldTicks > 0) g.lineStyle(4, 0x67e8f9, 0.9).strokeCircle(car.x, car.y, 47);
      if (combat.boostTicks > 0) {
        g.lineStyle(4, 0xa3e635).lineBetween(
          car.x - Math.cos(car.angle) * 38, car.y - Math.sin(car.angle) * 38,
          car.x - Math.cos(car.angle) * 58, car.y - Math.sin(car.angle) * 58);
      }
      if (combat.disruptor) g.fillStyle(0xd8a0ff).fillCircle(
        car.x + Math.cos(car.angle) * 37, car.y + Math.sin(car.angle) * 37, 5);
    }
  }

  private drawCarStatus(x: number, top: number, scale: number, combat: PlayerSnapshot): void {
    const g = this.graphics;
    const width = 48 * scale;
    const height = 5 * scale;
    g.fillStyle(0x070e14).fillRect(x - width / 2, top, width, height);
    g.fillStyle(combat.health > 25 ? 0x72e4b0 : 0xff6b70)
      .fillRect(x - width / 2, top, width * combat.health / RULES.health, height);
    const pipY = top + height + 6 * scale;
    for (let i = 0; i < RULES.goal; i++) {
      const pipX = x + (i - (RULES.goal - 1) / 2) * 10 * scale;
      if (i < combat.cores) g.fillStyle(0xffd166).fillCircle(pipX, pipY, 3 * scale);
      else g.lineStyle(scale, 0xffd166, 0.45).strokeCircle(pipX, pipY, 2.5 * scale);
    }
  }
}

window.addEventListener('error', event => {
  reportError(`Game error: ${event.message}`);
});
window.addEventListener('unhandledrejection', event => {
  reportError(`Game error: ${String(event.reason)}`);
});

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: ARENA.width,
  height: ARENA.height,
  backgroundColor: '#18232d',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: ArenaScene,
});
