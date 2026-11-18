/**
 * Super Admin roles & permissions. Pure TypeScript (no React).
 * One permission list per role; screens and the backend both check `can(role, perm)`.
 */
import type { Role } from './types';

export type AdminRole = Extract<Role, 'super_admin' | 'finance' | 'moderator' | 'support'>;
export const ADMIN_ROLES: AdminRole[] = ['super_admin', 'finance', 'moderator', 'support'];
export const isAdminRole = (r: Role): r is AdminRole => (ADMIN_ROLES as Role[]).includes(r);

export type AdminPerm =
  | 'overview'
  | 'approvals.educators'
  | 'approvals.courses'
  | 'approvals.reports'
  | 'tenants.view'
  | 'tenants.manage' // plan change, overrides, suspend
  | 'plans.edit'
  | 'config.edit' // commission %, fees, payout rules
  | 'money.view'
  | 'payouts.run'
  | 'refunds'
  | 'content.bodhin' // Bodhin's own courses, marketplace curation
  | 'users.view'
  | 'users.manage'
  | 'support.tickets'
  | 'broadcast'
  | 'admins.manage'
  | 'audit.view';

const ALL: AdminPerm[] = ['overview', 'approvals.educators', 'approvals.courses', 'approvals.reports', 'tenants.view', 'tenants.manage', 'plans.edit', 'config.edit', 'money.view', 'payouts.run', 'refunds', 'content.bodhin', 'users.view', 'users.manage', 'support.tickets', 'broadcast', 'admins.manage', 'audit.view'];

export const ROLE_PERMS: Record<AdminRole, AdminPerm[]> = {
  super_admin: ALL,
  finance: ['overview', 'tenants.view', 'money.view', 'payouts.run', 'refunds', 'audit.view'],
  moderator: ['overview', 'approvals.educators', 'approvals.courses', 'approvals.reports', 'tenants.view', 'content.bodhin'],
  support: ['overview', 'tenants.view', 'users.view', 'users.manage', 'support.tickets'],
};

export const ROLE_LABEL: Record<AdminRole, string> = { super_admin: 'Super Admin', finance: 'Finance', moderator: 'Moderator', support: 'Support' };

export const can = (role: AdminRole | null | undefined, perm: AdminPerm) => !!role && ROLE_PERMS[role].includes(perm);

/**
 * Which admin pages a role may open: path prefix → any one of these permissions.
 * Longest prefix wins. Tabs, the desktop sidebar and the admin layout all read this list,
 * so a hidden tab and a blocked direct link always agree.
 */
const ROUTE_PERMS: [prefix: string, perms: AdminPerm[]][] = [
  ['/admin', ['overview']],
  ['/admin/search', ['overview']],
  ['/admin/more', ['overview']],
  ['/admin/inbox', ['approvals.educators', 'approvals.courses', 'approvals.reports']],
  ['/admin/review', ['approvals.educators', 'approvals.courses', 'approvals.reports']],
  ['/admin/tenants', ['tenants.view']],
  ['/admin/tenant', ['tenants.view']],
  ['/admin/money', ['money.view', 'payouts.run', 'refunds']],
  ['/admin/plans', ['plans.edit', 'config.edit']],
  ['/admin/plan', ['plans.edit', 'config.edit']],
  ['/admin/settings', ['plans.edit', 'config.edit']],
  ['/admin/flags', ['plans.edit', 'config.edit']],
  ['/admin/pilot', ['plans.edit', 'config.edit']],
  ['/admin/live', ['plans.edit', 'config.edit']],
  ['/admin/growth', ['plans.edit', 'config.edit', 'content.bodhin']],
  ['/admin/content', ['content.bodhin']],
  // Bodhin content tools (Nov 16 change request): live classes, and the shared /edu screens scoped to Bodhin's academy
  // (quizzes, assignments, 1:1 mentorship, certificates, students).
  ['/admin/classes', ['content.bodhin']],
  ['/admin/playground', ['content.bodhin']],
  ['/edu', ['content.bodhin']],
  ['/admin/users', ['users.view']],
  ['/admin/user', ['users.view']],
  ['/admin/tickets', ['support.tickets']],
  ['/admin/broadcast', ['broadcast']],
  ['/admin/team', ['admins.manage']],
  ['/admin/audit', ['audit.view']],
];

/** True when this role may open the admin page at `path` (e.g. "/admin/money"). */
export function canOpenAdmin(role: AdminRole | null | undefined, path: string): boolean {
  if (!role) return false;
  const p = path.split('?')[0].replace(/\/+$/, '') || '/admin';
  let best: [string, AdminPerm[]] | null = null;
  for (const [prefix, perms] of ROUTE_PERMS) {
    if ((p === prefix || p.startsWith(prefix + '/')) && (!best || prefix.length > best[0].length)) best = [prefix, perms];
  }
  return !!best && best[1].some((perm) => can(role, perm));
}

/** Every admin action is written to the audit log (who, what, on which record, before → after). */
export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: string; // e.g. 'application.approve', 'config.update'
  target: { kind: 'tenant' | 'user' | 'course' | 'application' | 'config' | 'plan' | 'payout' | 'order' | 'admin' | 'report' | 'playground'; id: string; label: string };
  summary: string;
  before?: unknown;
  after?: unknown;
}
