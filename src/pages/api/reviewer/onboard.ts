import type { APIRoute } from 'astro';

import { getCfEnv } from '../../../lib/auth';
import { getMetricsEnv, json } from '../../../lib/metrics';
import { hasRole, getSessionUser } from '../../../lib/session';

export const prerender = false;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

function yamlEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
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

  const env = await getCfEnv() as Record<string, unknown>;
  const repo = env['KEYSTATIC_GITHUB_REPO'] as string | undefined;
  const token = env['GITHUB_TOKEN'] as string | undefined;
  if (!repo || !token || repo === 'your-username/gearpro') {
    return json({ ok: false, error: 'github_not_configured' }, 503);
  }

  const existingMapping = await db
    .prepare('SELECT author FROM authors_auth WHERE email = ?')
    .bind(sessionUser.email)
    .first<{ author: string }>();
  if (existingMapping) {
    return json({ ok: false, error: 'already_onboarded', slug: existingMapping.author }, 409);
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    slug?: string;
    role?: string;
    bio?: string;
    url?: string;
  };

  const name = (body.name ?? '').trim();
  const slug = (body.slug ?? '').trim();
  const authorRole = (body.role ?? '리뷰어').trim();
  const bio = (body.bio ?? '').trim();
  const url = (body.url ?? '').trim();

  if (!name || name.length > 40) {
    return json({ ok: false, error: 'bad_name' }, 400);
  }
  if (!SLUG_RE.test(slug)) {
    return json({ ok: false, error: 'bad_slug' }, 400);
  }
  if (!bio || bio.length > 400) {
    return json({ ok: false, error: 'bad_bio' }, 400);
  }
  if (url && !/^https:\/\//.test(url)) {
    return json({ ok: false, error: 'bad_url' }, 400);
  }

  const path = `src/content/authors/${slug}.yaml`;
  const check = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
      },
    },
  );
  if (check.ok) {
    return json({ ok: false, error: 'slug_taken' }, 409);
  }

  const bioFolded = bio
    .split(/\r?\n/)
    .map((line) => `  ${line.trim()}`)
    .join('\n');
  const yamlLines = [
    `name: ${yamlEscape(name)}`,
    `role: ${yamlEscape(authorRole)}`,
    `bio: >-`,
    bioFolded,
    ...(url ? [`url: '${yamlEscape(url)}'`] : []),
    `email: '${yamlEscape(sessionUser.email)}'`,
    '',
  ];
  const yaml = yamlLines.join('\n');

  const put = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({
      message: `onboard: add author ${slug}`,
      content: Buffer.from(yaml, 'utf8').toString('base64'),
    }),
  });
  if (!put.ok) {
    return json({ ok: false, error: 'github_write_failed', status: put.status }, 502);
  }

  await db
    .prepare('INSERT INTO authors_auth (email, author, author_name) VALUES (?, ?, ?)')
    .bind(sessionUser.email, slug, name)
    .run();

  return json({
    ok: true,
    slug,
    note: '포털은 바로 활성화됩니다. 작성자 페이지는 배포 후 반영됩니다.',
  });
};
