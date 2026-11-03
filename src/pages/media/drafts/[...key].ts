import type { APIRoute } from 'astro';

import { getCfEnv } from '../../../lib/auth';
import { json } from '../../../lib/metrics';
import { hasAnyRole, getSessionUser } from '../../../lib/session';

export const prerender = false;

const KEY_RE = /^[a-z0-9-]+\/[a-f0-9-]{36}\.(jpe?g|png|webp)$/;

export const GET: APIRoute = async ({ params, request }) => {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser || !hasAnyRole(sessionUser, ['editor', 'moderator', 'admin'])) {
    return new Response('Unauthorized', { status: 401 });
  }

  const rel = params.key ?? '';
  if (!KEY_RE.test(rel)) {
    return json({ error: 'bad_key' }, 400);
  }
  const key = `drafts/${rel}`;

  const env = await getCfEnv();
  const bucket = env['DRAFT_IMAGES'] as R2Bucket | undefined;
  if (!bucket) {
    return new Response('Storage unavailable', { status: 503 });
  }

  const object = await bucket.get(key);
  if (!object) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'cache-control': 'private, max-age=300',
    },
  });
};
