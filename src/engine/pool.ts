export interface Poolable {
  active: boolean;
}

/**
 * Fixed-capacity object pool. Objects are created once, at construction, so
 * the render loop never allocates when spawning targets or particles.
 */
export class Pool<T extends Poolable> {
  readonly items: T[];
  private cursor = 0;
  private live = 0;

  constructor(size: number, factory: (index: number) => T) {
    this.items = new Array<T>(size);
    for (let i = 0; i < size; i++) this.items[i] = factory(i);
  }

  get count(): number {
    return this.live;
  }

  acquire(): T | null {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n;
      const item = this.items[i] as T;
      if (!item.active) {
        item.active = true;
        this.cursor = (i + 1) % n;
        this.live++;
        return item;
      }
    }
    return null;
  }

  release(item: T): void {
    if (item.active) {
      item.active = false;
      this.live--;
    }
  }

  clear(): void {
    for (const item of this.items) item.active = false;
    this.live = 0;
  }
}
