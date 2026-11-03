import type { APIRoute } from 'astro';

import { createAuth, getCfEnv, type AuthEnv } from '../../../lib/auth';

export const prerender = false;

function allowedOrigins(env: AuthEnv): string[] {
  const list = [
    (env['SITE_URL'] as string) ?? 'https://gearpro.kr',
    (env['BETTER_AUTH_URL'] as string) ?? 'https://auth.gearpro.kr',
  ];
  if (import.meta.env.DEV) {
    list.push('http://127.0.0.1:4321', 'http://localhost:4321');
  }
  return list;
}

const handler: APIRoute = async ({ request }) => {
  const env = await getCfEnv();
  const origin = request.headers.get('origin');
  const cors: Record<string, string> = {};
  if (origin && allowedOrigins(env).includes(origin)) {
    cors['access-control-allow-origin'] = origin;
    cors['access-control-allow-credentials'] = 'true';
    cors['vary'] = 'Origin';
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
      },
    });
  }

  if (!env['BETTER_AUTH_SECRET']) {
    return new Response(JSON.stringify({ error: 'auth_not_configured' }), {
      status: 503,
      headers: { 'content-type': 'application/json', ...cors },
    });
  }

  const auth = createAuth(env);
  const res = await auth.handler(request);
  for (const [k, v] of Object.entries(cors)) {
    res.headers.set(k, v);
  }
  return res;
};

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
