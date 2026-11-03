import type { APIRoute } from 'astro';

import {
  clientIp,
  getMetricsEnv,
  ipHash,
  isSafeSlug,
  json,
  todayKST,
} from '../../../../lib/metrics';

export const prerender = false;

const DAILY_VOTE_CAP = 40;

export const POST: APIRoute = async (context) => {
  const slug = context.params.slug ?? '';
  if (!isSafeSlug(slug)) {
    return json({ error: 'bad_slug' }, 400);
  }

  const { db, secret } = await getMetricsEnv();
  if (!db || !secret) {
    return json({ ok: false, disabled: true }, 200);
  }

  const body = (await context.request.json().catch(() => ({}))) as { on?: boolean };
  const on = body.on === true;

  const known = await db
    .prepare('SELECT 1 AS x FROM reviews WHERE slug = ?')
    .bind(slug)
    .first();
  if (!known) {
    return json({ error: 'unknown_slug' }, 404);
  }

  const h = await ipHash(clientIp(context), secret);
  const day = todayKST();

  if (on) {
    const today = await db
      .prepare('SELECT COUNT(*) AS n FROM votes WHERE ip_hash = ? AND day = ?')
      .bind(h, day)
      .first<{ n: number }>();
    if ((today?.n ?? 0) >= DAILY_VOTE_CAP) {
      return json({ ok: false, reason: 'rate_limited' }, 429);
    }
    await db
      .prepare('INSERT OR IGNORE INTO votes (ip_hash, slug, day) VALUES (?, ?, ?)')
      .bind(h, slug, day)
      .run();
  } else {
    await db.prepare('DELETE FROM votes WHERE ip_hash = ? AND slug = ?').bind(h, slug).run();
  }

  const likes = await db
    .prepare('SELECT COUNT(*) AS n FROM votes WHERE slug = ?')
    .bind(slug)
    .first<{ n: number }>();

  return json({ ok: true, likes: likes?.n ?? 0 });
};
