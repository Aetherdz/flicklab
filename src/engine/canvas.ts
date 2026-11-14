export interface Viewport {
  cssW: number;
  cssH: number;
  dpr: number;
}

/**
 * Owns the backing store size, the DPR transform and resize handling.
 * DPR is capped (lower on touch devices) so 3x phones do not pay for a 12 MP
 * canvas that gains nothing visually.
 */
export class Surface {
  readonly ctx: CanvasRenderingContext2D;
  readonly view: Viewport = { cssW: 0, cssH: 0, dpr: 1 };

  private readonly ro: ResizeObserver;
  private readonly maxDpr: number;
  private dprQuery: MediaQueryList | null = null;
  private onResizeCb: ((v: Viewport) => void) | null = null;
  private disposed = false;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    this.maxDpr = matchMedia('(pointer: coarse)').matches ? 2 : 3;
    this.ro = new ResizeObserver(() => this.measure());
    this.ro.observe(canvas);
    this.watchDpr();
    this.measure();
  }

  onResize(cb: (v: Viewport) => void): void {
    this.onResizeCb = cb;
  }

  measure(): void {
    if (this.disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);

    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const changed = this.view.cssW !== cssW || this.view.cssH !== cssH || this.view.dpr !== dpr;
    this.view.cssW = cssW;
    this.view.cssH = cssH;
    this.view.dpr = dpr;
    if (changed) this.onResizeCb?.(this.view);
  }

  private watchDpr(): void {
    this.dprQuery?.removeEventListener('change', this.handleDprChange);
    const dpr = window.devicePixelRatio || 1;
    this.dprQuery = matchMedia(`(resolution: ${dpr}dppx)`);
    this.dprQuery.addEventListener('change', this.handleDprChange);
  }

  private readonly handleDprChange = (): void => {
    this.watchDpr();
    this.measure();
  };

  dispose(): void {
    this.disposed = true;
    this.ro.disconnect();
    this.dprQuery?.removeEventListener('change', this.handleDprChange);
  }
}
