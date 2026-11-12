/** Issuer + subject identify an authenticated person, never email/display name. */
export type EditorialRole = "Writer" | "Approver";
export type AccountRole = EditorialRole | "Administrator";
export interface AdminIdentity {
  readonly issuer: string;
  readonly subject: string;
  readonly displayName: string;
}
export interface AdminSession {
  readonly id: string;
  readonly userId: string;
  readonly actorId: string;
  readonly email: string;
  readonly identity: AdminIdentity;
  readonly roles: readonly AccountRole[];
  readonly expiresAt: number;
}
