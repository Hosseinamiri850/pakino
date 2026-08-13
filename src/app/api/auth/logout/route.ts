import { destroySession } from '@/lib/auth/session';
import { ok, handleError } from '@/lib/api/http';

export async function POST() {
  try {
    await destroySession();
    return ok({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
