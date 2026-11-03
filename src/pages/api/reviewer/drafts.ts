import type { APIRoute } from 'astro';

import { getCollection } from 'astro:content';

import { getMetricsEnv, json } from '../../../lib/metrics';
import { parseDraftInput, SLUG_RE } from '../../../lib/drafts';
import { hasRole, getSessionUser } from '../../../lib/session';

export const prerender = false;

interface DraftBody extends Record<string, unknown> {
  id?: number;
}

export const POST: APIRoute = async ({ request }) => {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser || !hasRole(sessionUser, 'editor')) {
    return json({ ok: false, error: 'login_required' }, 401);
  }

  const { db } = await getMetricsEnv();
  if (!db) {
    return json({ ok: false, error: 'metrics_unavailable' }, 503);
  }

  const mapped = await db
    .prepare('SELECT author, author_name FROM authors_auth WHERE email = ?')
    .bind(sessionUser.email)
    .first<{ author: string; author_name: string }>();
  if (!mapped) {
    return json({ ok: false, error: 'profile_required' }, 403);
  }

  const body = (await request.json().catch(() => ({}))) as DraftBody;
  let input;
  try {
    input = parseDraftInput(body).value;
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }

  const categories = await getCollection('categories');
  if (!categories.some((c) => c.id === input.category)) {
    return json({ ok: false, error: 'bad_category' }, 400);
  }

  const reviewSlugs = new Set((await getCollection('reviews')).map((r) => r.id));

  const existingById = body.id
    ? await db
        .prepare('SELECT id, author, slug, status, cover_r2_key FROM drafts WHERE id = ?')
        .bind(Number(body.id))
        .first<{ id: number; author: string; slug: string; status: string; cover_r2_key: string | null }>()
    : null;
  if (body.id && !existingById) {
    return json({ ok: false, error: 'not_found' }, 404);
  }
  if (existingById && existingById.author !== mapped.author) {
    return json({ ok: false, error: 'not_owner' }, 403);
  }
  if (existingById && existingById.status !== 'pending') {
    return json({ ok: false, error: 'not_editable' }, 409);
  }
  if (existingById && existingById.slug !== input.slug && reviewSlugs.has(input.slug)) {
    return json({ ok: false, error: 'slug_taken' }, 409);
  }
  if (!existingById && reviewSlugs.has(input.slug)) {
    return json({ ok: false, error: 'slug_taken' }, 409);
  }
  if (!existingById && !SLUG_RE.test(mapped.author)) {
    return json({ ok: false, error: 'bad_author' }, 400);
  }

  const coverKey =
    input.coverR2Key ?? existingById?.cover_r2_key ?? null;

  if (existingById) {
    await db
      .prepare(
        `UPDATE drafts SET slug = ?, title = ?, excerpt = ?, category = ?, brand = ?, price = ?, rating = ?, pros = ?, cons = ?, specs = ?, content = ?, cover_r2_key = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(
        input.slug,
        input.title,
        input.excerpt,
        input.category,
        input.brand,
        input.price,
        input.rating,
        JSON.stringify(input.pros),
        JSON.stringify(input.cons),
        JSON.stringify(input.specs),
        input.content,
        coverKey,
        existingById.id,
      )
      .run();
    return json({ ok: true, id: existingById.id, updated: true });
  }

  const slugConflict = await db
    .prepare('SELECT id FROM drafts WHERE slug = ?')
    .bind(input.slug)
    .first();
  if (slugConflict) {
    return json({ ok: false, error: 'slug_taken' }, 409);
  }

  await db
    .prepare(
      `INSERT INTO drafts (author, author_name, slug, title, excerpt, category, brand, price, rating, pros, cons, specs, content, cover_r2_key, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    )
    .bind(
      mapped.author,
      mapped.author_name,
      input.slug,
      input.title,
      input.excerpt,
      input.category,
      input.brand,
      input.price,
      input.rating,
      JSON.stringify(input.pros),
      JSON.stringify(input.cons),
      JSON.stringify(input.specs),
      input.content,
      coverKey,
    )
    .run();

  return json({ ok: true, created: true });
};

export const DELETE: APIRoute = async ({ request }) => {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser || !hasRole(sessionUser, 'editor')) {
    return json({ ok: false, error: 'login_required' }, 401);
  }

  const { db } = await getMetricsEnv();
  if (!db) {
    return json({ ok: false, error: 'metrics_unavailable' }, 503);
  }

  const body = (await request.json().catch(() => ({}))) as { id?: number };
  const row = body.id
    ? await db
        .prepare('SELECT id, author, status FROM drafts WHERE id = ?')
        .bind(Number(body.id))
        .first<{ id: number; author: string; status: string }>()
    : null;
  if (!row) {
    return json({ ok: false, error: 'not_found' }, 404);
  }
  const mapped = await db
    .prepare('SELECT author FROM authors_auth WHERE email = ?')
    .bind(sessionUser.email)
    .first<{ author: string }>();
  if (!mapped || (row.author !== mapped.author && !hasRole(sessionUser, 'admin'))) {
    return json({ ok: false, error: 'not_owner' }, 403);
  }
  if (row.status === 'published') {
    return json({ ok: false, error: 'not_deletable' }, 409);
  }

  await db.prepare('DELETE FROM drafts WHERE id = ?').bind(row.id).run();
  return json({ ok: true });
};

export const GET: APIRoute = async ({ request, url }) => {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser || !hasRole(sessionUser, 'editor')) {
    return json({ ok: false, error: 'login_required' }, 401);
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
    return json({ ok: true, drafts: [] });
  }

  const id = url.searchParams.get('id');
  if (id) {
    const row = await db
      .prepare('SELECT * FROM drafts WHERE id = ? AND author = ?')
      .bind(Number(id), mapped.author)
      .first();
    return json({ ok: true, draft: row ?? null });
  }

  const { results } = await db
    .prepare('SELECT * FROM drafts WHERE author = ? ORDER BY updated_at DESC')
    .bind(mapped.author)
    .all();

  return json({ ok: true, drafts: results ?? [] });
};
