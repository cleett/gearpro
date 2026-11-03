import type { APIRoute } from 'astro';

import { getMetricsEnv, isSafeSlug, json } from '../../../lib/metrics';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug ?? '';
  if (!isSafeSlug(slug)) {
    return json({ error: 'bad_slug' }, 400);
  }

  const { db } = await getMetricsEnv();
  if (!db) {
    return json({ views: 0, likes: 0, disabled: true });
  }

  const views = await db
    .prepare('SELECT COALESCE(SUM(n), 0) AS n FROM views WHERE slug = ?')
    .bind(slug)
    .first<{ n: number }>();
  const likes = await db
    .prepare('SELECT COUNT(*) AS n FROM votes WHERE slug = ?')
    .bind(slug)
    .first<{ n: number }>();

  return json({ views: views?.n ?? 0, likes: likes?.n ?? 0 });
};
