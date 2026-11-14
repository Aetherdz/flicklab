export interface PointerHandlers {
  onTap(x: number, y: number, ts: number): void;
  onMove(x: number, y: number, ts: number): void;
}

export interface PointerOptions {
  /** Multiplier applied to raw movement while pointer lock is active. */
  sensitivity?: number;
  /** Request pointer lock on the first tap. */
  lock?: boolean;
  onLockChange?: (locked: boolean) => void;
}

/**
 * Pointer input in canvas CSS pixels.
 *
 * Movement uses coalesced events when the browser provides them (one sample per
 * hardware report instead of one per frame) which is what makes tracking mode
 * measure real cursor motion. Pointer lock is optional and additive: when it is
 * unavailable the pointer path still works.
 */
export class PointerInput {
  cursorX = 0;
  cursorY = 0;
  locked = false;

  private sensitivity: number;
  private wantLock: boolean;
  private readonly rectScratch = { x: 0, y: 0, w: 0, h: 0 };
  private readonly cleanups: Array<() => void> = [];

  constructor(
    private readonly el: HTMLCanvasElement,
    private readonly handlers: PointerHandlers,
    private readonly opts: PointerOptions = {},
  ) {
    this.sensitivity = opts.sensitivity ?? 1;
    this.wantLock = opts.lock ?? false;
    this.cursorX = el.clientWidth / 2;
    this.cursorY = el.clientHeight / 2;

    this.listen(el, 'pointerdown', this.onPointerDown as EventListener, { passive: false });
    this.listen(el, 'pointermove', this.onPointerMove as EventListener, { passive: false });
    this.listen(el, 'contextmenu', this.onContextMenu);
    this.listen(document, 'pointerlockchange', this.onLockChange);
    this.listen(document, 'pointerlockerror', this.onLockError);
  }

  setSensitivity(value: number): void {
    this.sensitivity = Math.min(4, Math.max(0.2, value));
  }

  setLock(enabled: boolean): void {
    this.wantLock = enabled;
    if (!enabled && document.pointerLockElement === this.el) document.exitPointerLock();
  }

  /** Converts a client-space point to canvas-local CSS pixels. */
  toLocal(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    this.rectScratch.x = clientX - r.left;
    this.rectScratch.y = clientY - r.top;
    return this.rectScratch;
  }

  dispose(): void {
    for (const fn of this.cleanups) fn();
    this.cleanups.length = 0;
  }

  private listen(
    target: EventTarget,
    type: string,
    fn: EventListener,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, fn, options);
    this.cleanups.push(() => target.removeEventListener(type, fn, options));
  }

  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    ev.preventDefault();
    if (this.wantLock && !this.locked && ev.pointerType === 'mouse') {
      void this.el.requestPointerLock?.();
    }
    if (this.locked) {
      this.handlers.onTap(this.cursorX, this.cursorY, ev.timeStamp);
      return;
    }
    const p = this.toLocal(ev.clientX, ev.clientY);
    this.cursorX = p.x;
    this.cursorY = p.y;
    this.handlers.onTap(p.x, p.y, ev.timeStamp);
  };

  private readonly onPointerMove = (ev: PointerEvent): void => {
    if (this.locked) {
      this.cursorX = clamp(this.cursorX + ev.movementX * this.sensitivity, 0, this.el.clientWidth);
      this.cursorY = clamp(this.cursorY + ev.movementY * this.sensitivity, 0, this.el.clientHeight);
      this.handlers.onMove(this.cursorX, this.cursorY, ev.timeStamp);
      return;
    }
    if (ev.pointerType === 'touch') {
      ev.preventDefault();
    }
    const coalesced = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [];
    if (coalesced.length > 0) {
      for (const sample of coalesced) {
        const p = this.toLocal(sample.clientX, sample.clientY);
        this.cursorX = p.x;
        this.cursorY = p.y;
        this.handlers.onMove(p.x, p.y, sample.timeStamp);
      }
      return;
    }
    const p = this.toLocal(ev.clientX, ev.clientY);
    this.cursorX = p.x;
    this.cursorY = p.y;
    this.handlers.onMove(p.x, p.y, ev.timeStamp);
  };

  private readonly onContextMenu = (ev: Event): void => {
    ev.preventDefault();
  };

  private readonly onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.el;
    if (this.locked) {
      this.cursorX = this.el.clientWidth / 2;
      this.cursorY = this.el.clientHeight / 2;
    }
    this.opts.onLockChange?.(this.locked);
  };

  private readonly onLockError = (): void => {
    this.locked = false;
    this.opts.onLockChange?.(false);
  };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
