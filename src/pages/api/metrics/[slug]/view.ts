import type { APIRoute } from 'astro';

import {
  clientIp,
  getMetricsEnv,
  ipHash,
  isSafeSlug,
  todayKST,
} from '../../../../lib/metrics';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const slug = context.params.slug ?? '';
  if (!isSafeSlug(slug)) {
    return new Response(null, { status: 400 });
  }

  const { db, secret } = await getMetricsEnv();
  if (!db || !secret) {
    return new Response(null, { status: 204 });
  }

  const known = await db
    .prepare('SELECT 1 AS x FROM reviews WHERE slug = ?')
    .bind(slug)
    .first();
  if (!known) {
    return new Response(null, { status: 404 });
  }

  const h = await ipHash(clientIp(context), secret);
  const day = todayKST();

  const inserted = await db
    .prepare('INSERT OR IGNORE INTO view_dedup (ip_hash, slug, day) VALUES (?, ?, ?)')
    .bind(h, slug, day)
    .run();

  if ((inserted.meta.changes ?? 0) > 0) {
    await db
      .prepare(
        'INSERT INTO views (slug, day, n) VALUES (?, ?, 1) ON CONFLICT (slug, day) DO UPDATE SET n = n + 1',
      )
      .bind(slug, day)
      .run();
  }

  return new Response(null, { status: 204 });
};
