export type SfxName = 'hit' | 'miss' | 'count' | 'finish';

/**
 * Procedural Web Audio effects: the buffers are synthesised once on the first
 * user gesture, so there is no network fetch and no decode hitch on the first
 * hit. Playback latency is bounded by the output device, not by asset loading.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<SfxName, AudioBuffer>();
  private volume = 0.7;
  private muted = false;
  private unlocked = false;

  get ready(): boolean {
    return this.unlocked;
  }

  unlock(): void {
    if (this.unlocked) {
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.buildBuffers(ctx);
    this.unlocked = true;
    if (ctx.state === 'suspended') void ctx.resume();
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setMuted(value: boolean): void {
    this.muted = value;
    if (this.master) this.master.gain.value = value ? 0 : this.volume;
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    const master = this.master;
    const buffer = this.buffers.get(name);
    if (!ctx || !master || !buffer || this.muted) return;
    // Node creation is ~1 asset-free allocation per hit; the game loop itself
    // stays allocation-free (this is called from the input path, not render).
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(master);
    src.start();
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.buffers.clear();
    this.unlocked = false;
  }

  private buildBuffers(ctx: AudioContext): void {
    this.buffers.set('hit', this.render(ctx, 0.055, (t) => {
      const decay = Math.exp(-t * 90);
      const noise = (Math.random() * 2 - 1) * 0.5;
      const blip = Math.sin(2 * Math.PI * 1750 * t) * 0.65;
      return (noise * 0.5 + blip) * decay;
    }));
    this.buffers.set('miss', this.render(ctx, 0.11, (t) => {
      const decay = Math.exp(-t * 26);
      const f = 170 - 90 * Math.min(1, t / 0.11);
      return Math.sin(2 * Math.PI * f * t) * 0.55 * decay;
    }));
    this.buffers.set('count', this.render(ctx, 0.05, (t) => {
      const decay = Math.exp(-t * 55);
      return Math.sin(2 * Math.PI * 920 * t) * 0.4 * decay;
    }));
    this.buffers.set('finish', this.render(ctx, 0.28, (t) => {
      const decay = Math.exp(-t * 12);
      const a = Math.sin(2 * Math.PI * 660 * t) * 0.35;
      const b = Math.sin(2 * Math.PI * 990 * (t - 0.09)) * (t > 0.09 ? 0.35 : 0);
      return (a + b) * decay;
    }));
  }

  private render(
    ctx: AudioContext,
    seconds: number,
    sample: (t: number, sampleRate: number) => number,
  ): AudioBuffer {
    const sr = ctx.sampleRate;
    const length = Math.max(1, Math.floor(sr * seconds));
    const buffer = ctx.createBuffer(1, length, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      const t = i / sr;
      // 2 ms fade-out tail keeps the buffer from clicking at the end.
      const tail = i > length - sr * 0.002 ? (length - i) / (sr * 0.002) : 1;
      data[i] = sample(t, sr) * tail;
    }
    return buffer;
  }
}
