import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({
  getEnv: () => ({
    CREDITS_PER_IMAGE: 5,
    CREDITS_PER_VIDEO_10_SECONDS: 10,
    MAX_VIDEO_SIZE: 1,
    MAX_IMAGE_SIZE: 1,
    MAX_VIDEO_DURATION: 300,
  }),
}));

import { estimateCredits } from '@/lib/credits';

describe('estimateCredits', () => {
  beforeEach(() => vi.clearAllMocks());

  it('image flat rate', () => {
    expect(estimateCredits('image', null)).toBe(5);
  });
  it('video 10s => 10', () => {
    expect(estimateCredits('video', 10)).toBe(10);
  });
  it('video 25s rounds up => 30', () => {
    expect(estimateCredits('video', 25)).toBe(30);
  });
  it('video 0 => 0', () => {
    expect(estimateCredits('video', 0)).toBe(0);
  });
});
