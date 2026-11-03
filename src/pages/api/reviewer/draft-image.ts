import type { APIRoute } from 'astro';

import { getCfEnv } from '../../../lib/auth';
import { getMetricsEnv, json } from '../../../lib/metrics';
import { hasRole, getSessionUser } from '../../../lib/session';

export const prerender = false;

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const POST: APIRoute = async ({ request }) => {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser || !hasRole(sessionUser, 'editor')) {
    return json({ ok: false, error: 'login_required' }, 401);
  }

  const env = await getCfEnv();
  const bucket = env['DRAFT_IMAGES'] as R2Bucket | undefined;
  if (!bucket) {
    return json({ ok: false, error: 'storage_unavailable' }, 503);
  }

  const { db } = await getMetricsEnv();
  if (!db) {
    return json({ ok: false, error: 'metrics_unavailable' }, 503);
  }

  const mapped = await db
    .prepare('SELECT author FROM authors_auth WHERE email = ?')
    .bind(sessionUser.email)
    .first<{ author: string }>();
  if (!mapped) {
    return json({ ok: false, error: 'profile_required' }, 403);
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return json({ ok: false, error: 'file_required' }, 400);
  }
  const ext = ALLOWED[file.type];
  if (!ext) {
    return json({ ok: false, error: 'bad_type' }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ ok: false, error: 'too_large' }, 413);
  }

  const key = `drafts/${mapped.author}/${crypto.randomUUID()}.${ext}`;
  await bucket.put(key, file, {
    httpMetadata: { contentType: file.type },
  });

  return json({ ok: true, key, url: `/media/${key}` });
};
