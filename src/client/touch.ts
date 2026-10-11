import { idleInput, type CarInput } from '../shared/simulation';

type Action = 'throttle' | 'reverse' | 'handbrake' | 'fire';

export class TouchInput {
  private readonly actions = new Map<number, Action>();
  private steeringPointer?: number;
  private steering = 0;
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

  read(): CarInput {
    if (!this.enabled || document.hidden) return idleInput();
    const active = new Set(this.actions.values());
    return {
      throttle: Number(active.has('throttle')) - Number(active.has('reverse')),
      steering: this.steering,
      handbrake: active.has('handbrake'),
      fire: active.has('fire'),
    };
  }

  private readonly down = (event: PointerEvent): void => {
    if (!this.enabled || !(event.target instanceof Element)) return;
    const target = event.target.closest<HTMLElement>('#steering-pad, button[data-drive]');
    if (!target || !this.controls.contains(target)) return;
    event.preventDefault();
    this.focusArena();
    if (target === this.pad) {
      if (this.steeringPointer !== undefined) return;
      this.steeringPointer = event.pointerId;
      this.updateSteering(event.clientX);
    } else {
      const action = target.dataset.drive;
      if (action !== 'throttle' && action !== 'reverse' && action !== 'handbrake' && action !== 'fire') throw new Error(`Unknown touch action: ${action}`);
      this.actions.set(event.pointerId, action);
      target.classList.add('pressed');
    }
    target.setPointerCapture(event.pointerId);
  };

  private readonly move = (event: PointerEvent): void => {
    if (event.pointerId === this.steeringPointer) this.updateSteering(event.clientX);
  };

  private updateSteering(x: number): void {
    const rect = this.pad.getBoundingClientRect();
    this.setSteering(Math.max(-1, Math.min(1, (x - rect.x - rect.width / 2) / (rect.width * 0.35))));
  }

  private setSteering(value: number): void {
    this.steering = value;
    this.knob.style.transform = `translateX(${value * 30}px)`;
    this.pad.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  }

  private readonly release = (event: PointerEvent): void => {
    this.actions.delete(event.pointerId);
    if (event.pointerId === this.steeringPointer) {
      this.steeringPointer = undefined;
      this.setSteering(0);
    }
    for (const button of this.buttons) {
      button.classList.toggle('pressed', [...this.actions.values()].some(action => action === button.dataset.drive));
    }
  };

  private readonly key = (event: KeyboardEvent): void => {
    if (!this.enabled || !['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
    event.preventDefault();
    this.setSteering(event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0);
  };

  private readonly keyUp = (): void => { this.setSteering(0); };
  private readonly visibility = (): void => { if (document.hidden) this.clear(); };
  private readonly clear = (): void => {
    this.actions.clear();
    this.steeringPointer = undefined;
    this.setSteering(0);
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
