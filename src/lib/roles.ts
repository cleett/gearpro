import { createAccessControl } from 'better-auth/plugins';

export const ac = createAccessControl({
  user: ['read', 'update', 'delete'],
  role: ['manage'],
  membership: ['manage'],
  review: ['read', 'create', 'update', 'delete'],
  payout: ['read', 'request', 'approve'],
  metrics: ['read'],
});

export const ROLES = ['user', 'editor', 'moderator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  user: '회원',
  editor: '에디터',
  moderator: '모더레이터',
  admin: '관리자',
};

export const roles = {
  user: ac.newRole({}),
  editor: ac.newRole({
    review: ['read', 'create', 'update'],
    payout: ['read', 'request'],
    metrics: ['read'],
  }),
  moderator: ac.newRole({
    user: ['read'],
    payout: ['read'],
    metrics: ['read'],
  }),
  admin: ac.newRole({
    user: ['read', 'update', 'delete'],
    role: ['manage'],
    membership: ['manage'],
    review: ['read', 'create', 'update', 'delete'],
    payout: ['read', 'request', 'approve'],
    metrics: ['read'],
  }),
};

export function parseRoles(role: string | undefined | null): string[] {
  return (role ?? 'user')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

export function hasRole(
  user: { role?: string } | null | undefined,
  role: Role,
): boolean {
  return parseRoles(user?.role).includes(role);
}

export function hasAnyRole(
  user: { role?: string } | null | undefined,
  rolesToCheck: readonly Role[],
): boolean {
  const owned = parseRoles(user?.role);
  return rolesToCheck.some((r) => owned.includes(r));
}
