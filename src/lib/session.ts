import { createAuth, getCfEnv } from './auth';
import { hasAnyRole, hasRole, type Role } from './roles';

export { hasRole, hasAnyRole };
export type { Role };

export interface PortalUser {
  id: string;
  email: string;
  name: string;
  role: string;
  membership: string;
  image?: string | null;
}

export async function getSessionUser(request: Request): Promise<PortalUser | null> {
  const env = await getCfEnv();
  if (!env['BETTER_AUTH_SECRET']) {
    return null;
  }
  const auth = createAuth(env);
  const res = await auth.api.getSession({ headers: request.headers });
  if (!res?.user) {
    return null;
  }
  const u = res.user as {
    id: string;
    email: string;
    name: string;
    role?: string;
    membership?: string;
    image?: string | null;
  };
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role ?? 'user',
    membership: u.membership ?? 'free',
    image: u.image,
  };
}

export async function ensureAdminBootstrap(
  user: PortalUser,
): Promise<void> {
  const env = await getCfEnv();
  const adminEmails = String(env['ADMIN_EMAILS'] ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const db = env['METRICS_DB'] as D1Database | undefined;
  if (!db || adminEmails.length === 0) {
    return;
  }
  if (!adminEmails.includes(user.email.toLowerCase())) {
    return;
  }
  if (hasRole(user, 'admin')) {
    return;
  }
  await db
    .prepare('UPDATE "user" SET role = ? WHERE id = ?')
    .bind(`user,admin`, user.id)
    .run();
}
