import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '@/lib/validation/auth';

describe('loginSchema', () => {
  it('valid', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '12345678' }).success).toBe(true);
  });
  it('bad email', () => {
    expect(loginSchema.safeParse({ email: 'bad', password: '12345678' }).success).toBe(false);
  });
  it('short password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  it('mismatch passwords', () => {
    const r = registerSchema.safeParse({ email: 'a@b.com', password: '12345678', confirmPassword: '9' });
    expect(r.success).toBe(false);
  });
  it('match', () => {
    const r = registerSchema.safeParse({ email: 'a@b.com', password: '12345678', confirmPassword: '12345678' });
    expect(r.success).toBe(true);
  });
});
