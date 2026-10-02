import { describe, expect, it } from 'vitest';
import { formatDateBs, formatDateTimeBs, localized } from './format';

describe('format', () => {
  it('shows Bikram Sambat dates in Nepal time', () => {
    // 2025-04-13T18:15Z = 14 April 2025 00:00 in Kathmandu = 1 Baisakh 2082.
    expect(formatDateBs('2025-04-13T18:15:00Z')).toBe('1 Baisakh 2082');
    expect(formatDateTimeBs('2025-04-13T18:15:00Z')).toBe('1 Baisakh 2082, 00:00');
    expect(formatDateBs(null)).toBe('—');
  });

  it('prefers English and falls back to Nepali', () => {
    expect(localized({ en: 'Bachelor', ne: 'स्नातक' })).toBe('Bachelor');
    expect(localized({ ne: 'स्नातक' })).toBe('स्नातक');
  });
});
