import { idleInput, type CarInput } from '../shared/simulation';

export class DrivingInput {
  private readonly held = new Set<string>();
  private readonly codes = new Set([
    'KeyW', 'KeyS', 'KeyA', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyF',
  ]);
  private readonly down = (event: KeyboardEvent): void => {
    if (!this.arena.contains(document.activeElement) || !this.codes.has(event.code)) return;
    event.preventDefault();
    this.held.add(event.code);
  };
  private readonly up = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };
  private readonly clear = (): void => { this.held.clear(); };
  private readonly visibility = (): void => {
    if (document.hidden) this.clear();
  };
  private readonly focus = (): void => { this.arena.focus(); };

  constructor(private readonly arena: HTMLElement) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.clear);
    arena.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.visibility);
    arena.addEventListener('pointerdown', this.focus);
  }

  read(): CarInput {
    if (document.hidden || !this.arena.contains(document.activeElement)) return idleInput();
    const pressed = (...codes: string[]): number => Number(codes.some(code => this.held.has(code)));
    return {
      throttle: pressed('KeyS', 'ArrowDown') ? -1
        : pressed('KeyW', 'ArrowUp', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight'),
      steering: pressed('KeyD', 'ArrowRight') - pressed('KeyA', 'ArrowLeft'),
      handbrake: this.held.has('Space'),
      fire: this.held.has('KeyF'),
    };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.clear);
    this.arena.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.visibility);
    this.arena.removeEventListener('pointerdown', this.focus);
  }
}
