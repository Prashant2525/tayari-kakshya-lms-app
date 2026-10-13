import { describe, expect, it } from 'vitest';
import { moveTo } from './drag-reorder';

describe('moveTo (KI-024)', () => {
  it('moves an item onto another item’s place, up or down', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(moveTo(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveTo(['a', 'b'], 'b', 'a')).toEqual(['b', 'a']);
  });
  it('leaves the order alone for itself or an unknown id', () => {
    const ids = ['a', 'b'];
    expect(moveTo(ids, 'a', 'a')).toBe(ids);
    expect(moveTo(ids, 'x', 'a')).toBe(ids);
  });
});
