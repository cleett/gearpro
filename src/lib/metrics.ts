export interface MetricsEnv {
  db?: D1Database;
  secret?: string;
  error?: string;
}

export async function getMetricsEnv(): Promise<MetricsEnv> {
  try {
    const mod = await import('cloudflare:workers');
    const env = (mod as unknown as { env?: Record<string, unknown> }).env ?? {};
    return {
      db: env['METRICS_DB'] as D1Database | undefined,
      secret: env['METRICS_SECRET'] as string | undefined,
    };
  } catch {
    return { db: undefined, secret: undefined };
  }
}

export function todayKST(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
}

export function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug);
}

export async function ipHash(ip: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(`${ip}:${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function clientIp(context: { clientAddress?: string; request: Request }): string {
  return (
    context.clientAddress ??
    context.request.headers.get('cf-connecting-ip') ??
    'unknown'
  );
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
