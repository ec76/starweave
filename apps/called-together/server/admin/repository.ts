import { sessionQuery } from "./session-query.ts";
import "server-only";
import sql from "mssql";
import { database } from "../database.ts";
import {
  accountIssuer,
  rolesFrom,
  type AccountSummary,
} from "../../domain/accounts.ts";
import type { AdminSession } from "../../domain/admin-auth.js";
import {
  authSessionDiagnostic,
  authStage,
  authStageSync,
} from "./diagnostics.ts";
import { createThrottle } from "./throttle.ts";

export interface AccountOperation {
  action:
    | "create"
    | "grant_role"
    | "revoke_role"
    | "enable"
    | "disable"
    | "revoke_sessions";
  targetId?: string;
  email?: string;
  name?: string;
  role?: string;
  roles?: readonly string[];
}
export interface AccountRepository {
  throttle(bucket: string, maximum: number): Promise<boolean>;
  session(id: string): Promise<AdminSession | null>;
  list(): Promise<AccountSummary[]>;
  manage(sessionId: string, operation: AccountOperation): Promise<void>;
}
export const accounts: AccountRepository = {
  throttle: createThrottle(async () => {
    const pool = await authStage("database_connection", "mssql_pool", () =>
      database.getPool(),
    );
    return pool.request();
  }),
  async session(id) {
    const pool = await authStage("database_connection", "mssql_pool", () =>
      database.getPool(),
    );
    const live = await authStage("query", "session_liveness", async () => {
      const result = await sessionQuery(
        pool,
        id,
        "SELECT s.id FROM dbo.AuthSessions s WHERE s.id = @id AND s.expiresAt > SYSUTCDATETIME();",
      );
      return result.recordset.length === 1;
    });
    authSessionDiagnostic({ sqlSessionLive: live });
    if (!live) return null;
    // Retain the original combined authorization gate, including SQL expiry.
    // A liveness observation alone never authorizes the session.
    const row = await authStage(
      "query",
      "session_account_invitation",
      async () => {
        const result = await sessionQuery(
          pool,
          id,
          `
      SELECT s.id, s.userId, s.expiresAt, u.actorId, u.email, u.name
      FROM dbo.AuthSessions s JOIN dbo.AuthUsers u ON u.id = s.userId AND u.disabled = 0 AND u.activatedAt IS NOT NULL AND u.emailVerified = 1
      JOIN dbo.AuthInvitations i ON i.UserId = u.id AND i.AcceptedAt IS NOT NULL
      WHERE s.id = @id AND s.expiresAt > SYSUTCDATETIME();`,
        );
        return result.recordset[0];
      },
    );
    authSessionDiagnostic({ accountInvitationAuthorized: Boolean(row) });
    if (!row) return null;
    const roleResult = await authStage("query", "session_roles", () =>
      sessionQuery(
        pool,
        id,
        `
      SELECT r.Role FROM dbo.AuthRoleAssignments r JOIN dbo.AuthSessions s ON s.userId = r.UserId WHERE s.id = @id;`,
      ),
    );
    return authStageSync("session", "session_mapping", () => {
      const roles = rolesFrom(roleResult.recordset.map((r) => r.Role));
      authSessionDiagnostic({ rolesPresent: roles.length > 0 });
      return {
        id: String(row.id),
        userId: String(row.userId),
        actorId: String(row.actorId),
        email: String(row.email),
        identity: {
          issuer: accountIssuer,
          subject: String(row.userId),
          displayName: String(row.name),
        },
        roles,
        expiresAt: Math.floor(new Date(String(row.expiresAt)).getTime() / 1000),
      };
    });
  },
  async list() {
    const pool = await authStage("database_connection", "mssql_pool", () =>
      database.getPool(),
    );
    const result = await authStage("query", "admin_account_list", () =>
      pool.request().query(`
      SELECT TOP (100) u.id, u.name, u.email, u.disabled, u.activatedAt,
        (SELECT r.Role FROM dbo.AuthRoleAssignments r WHERE r.UserId = u.id FOR JSON PATH) AS roles
      FROM dbo.AuthUsers u ORDER BY u.createdAt DESC, u.id;`),
    );
    return authStageSync("admin_page", "admin_account_mapping", () =>
      result.recordset.map((row) => ({
        ...row,
        activatedAt: row.activatedAt
          ? new Date(row.activatedAt).toISOString()
          : null,
        roles: rolesFrom(
          (JSON.parse(row.roles) as { Role: string }[]).map((r) => r.Role),
        ),
      })),
    );
  },
  async manage(sessionId, op) {
    await (
      await database.getPool()
    )
      .request()
      .input("SessionId", sql.NVarChar(36), sessionId)
      .input("Action", sql.VarChar(30), op.action)
      .input("TargetId", sql.NVarChar(36), op.targetId ?? null)
      .input("Email", sql.NVarChar(254), op.email ?? null)
      .input("Name", sql.NVarChar(200), op.name ?? null)
      .input("Role", sql.VarChar(20), op.role ?? null)
      .input(
        "Roles",
        sql.NVarChar(100),
        op.roles ? JSON.stringify(op.roles) : null,
      )
      .execute("dbo.AuthManageAccount");
  },
};
