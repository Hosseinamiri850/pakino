import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const authority = url.searchParams.get('authority') ?? '';
  const cb = new URL('/api/payments/callback', getEnv().APP_URL);
  cb.searchParams.set('Authority', authority);
  cb.searchParams.set('Status', 'OK');
  return NextResponse.redirect(cb);
}
