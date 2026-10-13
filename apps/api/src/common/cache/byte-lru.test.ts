import { describe, expect, it } from 'vitest';
import { ByteLru } from './byte-lru.js';

const buf = (n: number) => Buffer.alloc(n);

describe('ByteLru (KI-022)', () => {
  it('keeps the total under the limit, dropping the least recently used first', () => {
    const cache = new ByteLru(100);
    cache.set('a', buf(20));
    cache.set('b', buf(20));
    cache.set('c', buf(20));
    cache.get('a'); // a is now the most recent
    cache.set('d', buf(20));
    cache.set('e', buf(25)); // over 100: b goes (least recently used)
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBeDefined();
    expect(cache.size).toBeLessThanOrEqual(100);
    cache.set('big', buf(30)); // more than a quarter of the cache: not kept
    expect(cache.get('big')).toBeUndefined();
  });

  it('computes a key once for callers asking at the same time; failures are retried later', async () => {
    const cache = new ByteLru(1000);
    let calls = 0;
    const load = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 5));
      return buf(10);
    };
    const [x, y] = await Promise.all([cache.getOrLoad('k', load), cache.getOrLoad('k', load)]);
    expect(x).toBe(y);
    expect(calls).toBe(1);
    await cache.getOrLoad('k', load);
    expect(calls).toBe(1);

    let attempts = 0;
    const flaky = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('storage down');
      return buf(5);
    };
    await expect(cache.getOrLoad('f', flaky)).rejects.toThrow('storage down');
    await expect(cache.getOrLoad('f', flaky)).resolves.toHaveLength(5);
  });
});
