import { idleInput, type CarInput } from '../shared/simulation';

type Action = 'fire';

export class TouchInput {
  private readonly actions = new Map<number, Action>();
  private steeringPointer?: number;
  private steeringOrigin = { x: 0, y: 0 };
  private direction = { x: 0, y: 0 };
  private backingUp = false;
  private readonly heldKeys = new Set<string>();
  private enabled = false;
  private readonly buttons: HTMLButtonElement[];
  private readonly knob: HTMLElement;

  constructor(
    private readonly controls: HTMLElement,
    private readonly pad: HTMLElement,
    private readonly focusArena: () => void,
  ) {
    this.buttons = [...controls.querySelectorAll<HTMLButtonElement>('button[data-drive]')];
    const knob = pad.querySelector<HTMLElement>('#steering-knob');
    if (!knob) throw new Error('Missing steering knob');
    this.knob = knob;
    controls.addEventListener('pointerdown', this.down);
    controls.addEventListener('pointermove', this.move);
    controls.addEventListener('pointerup', this.release);
    controls.addEventListener('pointercancel', this.release);
    controls.addEventListener('lostpointercapture', this.release);
    pad.addEventListener('keydown', this.key);
    pad.addEventListener('keyup', this.keyUp);
    pad.addEventListener('blur', this.clear);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.visibility);
    this.setEnabled(false);
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) this.clear();
    this.enabled = enabled;
    for (const button of this.buttons) button.disabled = !enabled;
    this.pad.setAttribute('aria-disabled', String(!enabled));
  }

  read(angle: number, speed: number): CarInput {
    if (!this.enabled || document.hidden) return idleInput();
    const active = new Set(this.actions.values());
    const strength = Math.min(1, Math.max(0, Math.hypot(this.direction.x, this.direction.y) - 6) / 42);
    const desired = Math.atan2(this.direction.y, this.direction.x);
    const turn = Math.atan2(Math.sin(desired - angle), Math.cos(desired - angle));
    if (strength === 0 || Math.abs(turn) < Math.PI / 2) this.backingUp = false;
    else if (speed < 35 && Math.abs(turn) > Math.PI * 0.75) this.backingUp = true;
    const steeringTurn = this.backingUp
      ? -Math.atan2(Math.sin(desired - angle - Math.PI), Math.cos(desired - angle - Math.PI))
      : turn;
    return {
      throttle: this.backingUp ? -strength : strength * (0.3 + 0.7 * Math.max(0, Math.cos(turn))),
      steering: strength > 0 ? Math.max(-1, Math.min(1, steeringTurn * 2)) : 0,
      handbrake: false,
      fire: active.has('fire'),
    };
  }

  private readonly down = (event: PointerEvent): void => {
    if (!this.enabled || !(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>('#steering-pad, button[data-drive]');
    if (!target || !this.controls.contains(target)) return;
    if (target instanceof HTMLButtonElement && target.disabled) return;
    event.preventDefault();
    this.focusArena();
    if (target === this.pad) {
      if (this.steeringPointer !== undefined) return;
      this.steeringPointer = event.pointerId;
      this.steeringOrigin = { x: event.clientX, y: event.clientY };
      this.updateDirection(event.clientX, event.clientY);
    } else {
      const action = target.dataset.drive;
      if (action !== 'fire') throw new Error(`Unknown touch action: ${action}`);
      this.actions.set(event.pointerId, action);
      target.classList.add('pressed');
    }
    target.setPointerCapture(event.pointerId);
  };

  private readonly move = (event: PointerEvent): void => {
    if (event.pointerId === this.steeringPointer) this.updateDirection(event.clientX, event.clientY);
  };

  private updateDirection(x: number, y: number): void {
    const rect = this.pad.getBoundingClientRect();
    const dx = x - this.steeringOrigin.x;
    const dy = y - this.steeringOrigin.y;
    this.setDirection(dx, dy);
    const knobLimit = (rect.width - this.knob.offsetWidth) / 2;
    const knobX = Math.max(-knobLimit, Math.min(knobLimit, x - rect.x - rect.width / 2));
    const knobY = Math.max(-knobLimit, Math.min(knobLimit, y - rect.y - rect.height / 2));
    this.knob.style.transform = `translate(${knobX}px, ${knobY}px)`;
  }

  private setDirection(x: number, y: number): void {
    this.direction = { x, y };
    const distance = Math.hypot(x, y);
    if (distance <= 6) this.backingUp = false;
    this.knob.style.transform = `translate(${x * Math.min(1, 40 / Math.max(1, distance))}px, ${y * Math.min(1, 40 / Math.max(1, distance))}px)`;
    this.pad.setAttribute('aria-valuenow', String(Math.round(Math.min(1, Math.max(0, distance - 6) / 42) * 100)));
    this.pad.setAttribute('aria-valuetext', distance <= 6 ? 'Coasting'
      : `Drive towards screen ${y < -6 ? 'up ' : y > 6 ? 'down ' : ''}${x < -6 ? 'left' : x > 6 ? 'right' : ''}`.trim());
  }

  private readonly release = (event: PointerEvent): void => {
    this.actions.delete(event.pointerId);
    if (event.pointerId === this.steeringPointer) {
      this.steeringPointer = undefined;
      this.setDirection(0, 0);
    }
    for (const button of this.buttons) {
      button.classList.toggle('pressed', [...this.actions.values()].some(action => action === button.dataset.drive));
    }
  };

  private readonly key = (event: KeyboardEvent): void => {
    if (!this.enabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') this.heldKeys.clear();
    else this.heldKeys.add(event.key);
    this.updateKeys();
  };

  private updateKeys(): void {
    this.setDirection(
      (Number(this.heldKeys.has('ArrowRight')) - Number(this.heldKeys.has('ArrowLeft'))) * 48,
      (Number(this.heldKeys.has('ArrowDown')) - Number(this.heldKeys.has('ArrowUp'))) * 48,
    );
  }

  private readonly keyUp = (event: KeyboardEvent): void => {
    if (!this.heldKeys.has(event.key)) return;
    this.heldKeys.delete(event.key);
    this.updateKeys();
  };
  private readonly visibility = (): void => { if (document.hidden) this.clear(); };
  private readonly clear = (): void => {
    this.actions.clear();
    this.steeringPointer = undefined;
    this.heldKeys.clear();
    this.setDirection(0, 0);
    for (const button of this.buttons) button.classList.remove('pressed');
  };

  destroy(): void {
    this.clear();
    this.controls.removeEventListener('pointerdown', this.down);
    this.controls.removeEventListener('pointermove', this.move);
    this.controls.removeEventListener('pointerup', this.release);
    this.controls.removeEventListener('pointercancel', this.release);
    this.controls.removeEventListener('lostpointercapture', this.release);
    this.pad.removeEventListener('keydown', this.key);
    this.pad.removeEventListener('keyup', this.keyUp);
    this.pad.removeEventListener('blur', this.clear);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.visibility);
  }
}
