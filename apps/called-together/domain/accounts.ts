import type { AccountRole, AdminSession } from "./admin-auth.js";
export const accountRoles = ["Writer", "Approver", "Administrator"] as const;
export const accountIssuer = "urn:called-together:users";
export class AdminAccessError extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? "Authentication required." : "Access required.");
  }
}
export function rolesFrom(value: unknown): AccountRole[] {
  return Array.isArray(value)
    ? accountRoles.filter((role) => value.includes(role))
    : [];
}
export function requireAuthentication(
  session: AdminSession | null,
): AdminSession {
  if (!session) throw new AdminAccessError(401);
  return session;
}
export function requireRoles(
  session: AdminSession | null,
  allowed: readonly AccountRole[],
): AdminSession {
  const current = requireAuthentication(session);
  if (!allowed.some((role) => current.roles.includes(role)))
    throw new AdminAccessError(403);
  return current;
}
export function requireEditorialRole(
  session: AdminSession | null,
  allowed: readonly ("Writer" | "Approver")[] = ["Writer", "Approver"],
) {
  return requireRoles(session, allowed);
}
/** A future approval endpoint must apply this after requiring Approver. */
export function requireIndependentApprover(
  session: AdminSession | null,
  createdByActorId: string,
) {
  const current = requireEditorialRole(session, ["Approver"]);
  if (current.actorId.toLowerCase() === createdByActorId.toLowerCase())
    throw new AdminAccessError(403);
  return current;
}
export function accountEmail(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
      value,
    ) ||
    /[\s\x00-\x1f]/.test(value)
  )
    throw new Error("Invalid email.");
  return value.toLowerCase();
}
export function accountName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 200 ||
    /[\x00-\x1f]/.test(value)
  )
    throw new Error("Invalid name.");
  return value.trim();
}
export function accountId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error("Invalid account.");
  return value;
}
export interface AccountSummary {
  id: string;
  name: string;
  email: string;
  disabled: boolean;
  activatedAt?: string | null;
  roles: AccountRole[];
}
