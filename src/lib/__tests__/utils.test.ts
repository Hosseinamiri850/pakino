import { describe, expect, it } from 'vitest';
import { formatBytes, formatNumber, formatDuration } from '@/lib/utils';

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(0, 'en')).toBe('0 B');
    expect(formatBytes(1024, 'en')).toBe('1 KB');
    expect(formatBytes(1024 ** 2, 'en')).toBe('1 MB');
  });
  it('persian locale', () => {
    expect(formatBytes(1024, 'fa')).toMatch(/KB/);
  });
});

describe('formatNumber', () => {
  it('english digits', () => {
    expect(formatNumber(1000, 'en')).toBe('1,000');
  });
});

describe('formatDuration', () => {
  it('mm:ss', () => {
    expect(formatDuration(65, 'en')).toBe('01:05');
  });
});
