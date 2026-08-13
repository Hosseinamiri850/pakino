import { NextResponse } from 'next/server';
import { AppError } from '@/lib/types';

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(error: string, status = 400, details?: unknown) {
  return NextResponse.json({ error, details }, { status });
}

export function handleError(e: unknown) {
  if (e instanceof AppError) return fail(e.code, e.status, e.message);
  return fail('generic', 500);
}

export async function getClientIp(req: Request): Promise<string> {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}
