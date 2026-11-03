import type { APIRoute } from 'astro';

import { getMetricsEnv, json, todayKST } from '../../../lib/metrics';
import { hasRole, getSessionUser } from '../../../lib/session';
import { estimateAmount, getRateCard } from '../../../lib/reviewer';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser || !hasRole(sessionUser, 'editor')) {
    return json({ ok: false, error: 'login_required' }, 401);
  }

  const { db } = await getMetricsEnv();
  if (!db) {
    return json({ ok: false, error: 'metrics_unavailable' }, 503);
  }

  const body = (await request.json().catch(() => ({}))) as { month?: string };
  const month = body.month ?? todayKST().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return json({ ok: false, error: 'bad_month' }, 400);
  }

  const mapped = await db
    .prepare('SELECT author, author_name FROM authors_auth WHERE email = ?')
    .bind(sessionUser.email)
    .first<{ author: string; author_name: string }>();
  if (!mapped) {
    return json({ ok: false, error: 'not_registered' }, 403);
  }

  const existing = await db
    .prepare('SELECT id, status FROM payout_requests WHERE author = ? AND month = ?')
    .bind(mapped.author, month)
    .first<{ id: number; status: string }>();
  if (existing) {
    return json({ ok: true, already: true, status: existing.status });
  }

  const prefix = `${month}-%`;
  const mine = await db
    .prepare('SELECT slug FROM reviews WHERE author = ?')
    .bind(mapped.author)
    .all<{ slug: string }>();
  const slugs = (mine.results ?? []).map((r) => r.slug);

  let views = 0;
  let likes = 0;
  if (slugs.length > 0) {
    const ph = slugs.map(() => '?').join(',');
    const v = await db
      .prepare(`SELECT COALESCE(SUM(n), 0) AS n FROM views WHERE slug IN (${ph}) AND day LIKE ?`)
      .bind(...slugs, prefix)
      .first<{ n: number }>();
    views = v?.n ?? 0;
    const l = await db
      .prepare(`SELECT COUNT(*) AS n FROM votes WHERE slug IN (${ph}) AND day LIKE ?`)
      .bind(...slugs, prefix)
      .first<{ n: number }>();
    likes = l?.n ?? 0;
  }

  const rates = await getRateCard(db);
  const amount = estimateAmount(views, likes, rates);

  await db
    .prepare(
      'INSERT INTO payout_requests (author, author_name, month, views, likes, amount) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(mapped.author, mapped.author_name, month, views, likes, amount)
    .run();

  return json({ ok: true, amount, views, likes });
};
