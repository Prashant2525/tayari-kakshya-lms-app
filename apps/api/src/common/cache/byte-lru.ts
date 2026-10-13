/**
 * A per-process cache of byte buffers, limited by total size (least recently used goes first). Requests for a key
 * already being computed share that work. Used for PDFs (KI-022): every API process keeps its own.
 */
export class ByteLru {
  private readonly entries = new Map<string, Buffer>();
  private readonly loading = new Map<string, Promise<Buffer>>();
  private bytes = 0;

  constructor(private readonly maxBytes: number) {}

  get size(): number {
    return this.bytes;
  }

  get(key: string): Buffer | undefined {
    const hit = this.entries.get(key);
    if (hit) {
      // Most recently used goes to the end.
      this.entries.delete(key);
      this.entries.set(key, hit);
    }
    return hit;
  }

  set(key: string, value: Buffer): void {
    if (value.length > this.maxBytes / 4) return; // one file never pushes most of the cache out
    const old = this.entries.get(key);
    if (old) {
      this.bytes -= old.length;
      this.entries.delete(key);
    }
    this.entries.set(key, value);
    this.bytes += value.length;
    for (const [k, v] of this.entries) {
      if (this.bytes <= this.maxBytes) break;
      this.entries.delete(k);
      this.bytes -= v.length;
    }
  }

  /** The cached value, or `load()` once for all callers asking at the same time (failures are not cached). */
  async getOrLoad(key: string, load: () => Promise<Buffer>): Promise<Buffer> {
    const hit = this.get(key);
    if (hit) return hit;
    const pending = this.loading.get(key);
    if (pending) return pending;
    const promise = load()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => this.loading.delete(key));
    this.loading.set(key, promise);
    return promise;
  }
}
