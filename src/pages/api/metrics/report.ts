import type { APIRoute } from 'astro';

import { getMetricsEnv, json, todayKST } from '../../../lib/metrics';
import { hasAnyRole, getSessionUser } from '../../../lib/session';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const { db, secret } = await getMetricsEnv();
  if (!db || !secret) {
    return new Response('Metrics not configured', { status: 503 });
  }
  const sessionUser = await getSessionUser(request);
  const isStaff = hasAnyRole(sessionUser, ['admin', 'moderator']);
  if (request.headers.get('x-metrics-secret') !== secret && !isStaff) {
    return new Response('Unauthorized', { status: 401 });
  }

  const month = url.searchParams.get('month') ?? todayKST().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return json({ error: 'month must be YYYY-MM' }, 400);
  }
  const prefix = `${month}-%`;

  if (url.searchParams.get('type') === 'payouts') {
    const { results } = await db
      .prepare(
        'SELECT id, author, author_name, month, views, likes, amount, status, created_at FROM payout_requests ORDER BY created_at DESC',
      )
      .all<{
        id: number;
        author: string;
        author_name: string;
        month: string;
        views: number;
        likes: number;
        amount: number;
        status: string;
        created_at: string;
      }>();
    const lines = ['id,author,author_name,month,views,likes,amount,status,created_at'];
    for (const r of results ?? []) {
      lines.push(
        [r.id, r.author, r.author_name, r.month, r.views, r.likes, r.amount, r.status, r.created_at]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      );
    }
    return new Response(lines.join('\n') + '\n', {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="gearpro-payouts.csv"`,
      },
    });
  }

  const { results } = await db
    .prepare(
      `SELECT r.author,
              r.author_name,
              COUNT(*) AS reviews,
              COALESCE(SUM(v.n), 0) AS views,
              COALESCE(SUM(l.likes), 0) AS likes
         FROM reviews r
         LEFT JOIN (SELECT slug, SUM(n) AS n FROM views WHERE day LIKE ? GROUP BY slug)
           AS v ON v.slug = r.slug
         LEFT JOIN (SELECT slug, COUNT(*) AS likes FROM votes WHERE day LIKE ? GROUP BY slug)
           AS l ON l.slug = r.slug
        GROUP BY r.author, r.author_name
        ORDER BY views DESC`,
    )
    .bind(prefix, prefix)
    .all<{ author: string; author_name: string; reviews: number; views: number; likes: number }>();

  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = ['author,author_name,reviews,views,likes'];
  for (const row of results ?? []) {
    lines.push([esc(row.author), esc(row.author_name), esc(row.reviews), esc(row.views), esc(row.likes)].join(','));
  }

  return new Response(lines.join('\n') + '\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="gearpro-metrics-${month}.csv"`,
    },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const { db, secret } = await getMetricsEnv();
  if (!db || !secret) {
    return json({ ok: false, error: 'metrics_unavailable' }, 503);
  }
  const sessionUser = await getSessionUser(request);
  const isAdmin = hasAnyRole(sessionUser, ['admin']);
  if (request.headers.get('x-metrics-secret') !== secret && !isAdmin) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const body = (await request.json().catch(() => ({}))) as {
    id?: number;
    status?: string;
  };
  const id = body.id;
  const status = body.status;
  if (!id || !status || !['requested', 'paid', 'rejected'].includes(status)) {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  await db
    .prepare(
      "UPDATE payout_requests SET status = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(status, id)
    .run();

  return json({ ok: true });
};
