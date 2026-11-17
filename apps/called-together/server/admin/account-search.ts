import "server-only";
import sql from "mssql";
import { database } from "../database.ts";
import {
  requireRoles,
  rolesFrom,
  type AccountSummary,
} from "../../domain/accounts.ts";
import type { AdminSession } from "../../domain/admin-auth.ts";
import {
  accountFilter,
  accountPageSize,
  type AccountFilter,
} from "../../domain/account-search.ts";
import { authStage } from "./diagnostics.ts";

/** Existing AuthUsers/AuthRoleAssignments SELECT rights only; no credential columns. */
export async function searchAccounts(
  session: AdminSession | null,
  input: AccountFilter,
) {
  requireRoles(session, ["Administrator"]);
  const filter = accountFilter({ ...input, page: String(input.page) });
  return authStage("query", "admin_account_list", async () => {
    const request = (await database.getPool()).request();
    const result = await request
      .input("Search", sql.NVarChar(254), filter.q)
      .input("Status", sql.VarChar(8), filter.status)
      .input("Role", sql.VarChar(20), filter.role)
      .input("Offset", sql.Int, (filter.page - 1) * accountPageSize)
      .input("Take", sql.Int, accountPageSize + 1)
      .query(`SELECT u.id,u.name,u.email,u.disabled,u.activatedAt,
        (SELECT r.Role FROM dbo.AuthRoleAssignments r WHERE r.UserId=u.id ORDER BY r.Role FOR JSON PATH) AS roles
        FROM dbo.AuthUsers u
        WHERE (@Search=N'' OR CHARINDEX(@Search,u.name COLLATE Latin1_General_100_CI_AS)>0 OR CHARINDEX(@Search,u.email COLLATE Latin1_General_100_CI_AS)>0)
        AND (@Status='' OR (@Status='disabled' AND u.disabled=1)
          OR (@Status='pending' AND u.disabled=0 AND u.activatedAt IS NULL)
          OR (@Status='active' AND u.disabled=0 AND u.activatedAt IS NOT NULL))
        AND (@Role='' OR EXISTS(SELECT 1 FROM dbo.AuthRoleAssignments r WHERE r.UserId=u.id AND r.Role=@Role))
        ORDER BY u.createdAt DESC,u.id OFFSET @Offset ROWS FETCH NEXT @Take ROWS ONLY;`);
    return {
      accounts: result.recordset.slice(0, accountPageSize).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        email: String(row.email),
        disabled: Boolean(row.disabled),
        activatedAt: row.activatedAt
          ? new Date(row.activatedAt).toISOString()
          : null,
        roles: rolesFrom(
          (JSON.parse(row.roles) as { Role: string }[]).map((r) => r.Role),
        ),
      })) as AccountSummary[],
      hasMore: filter.page < 10000 && result.recordset.length > accountPageSize,
    };
  });
}

export async function accountCounts(session: AdminSession | null) {
  requireRoles(session, ["Administrator"]);
  return authStage("query", "admin_account_list", async () => {
    const result = await (await database.getPool()).request().query(`SELECT
      COUNT(CASE WHEN disabled=0 AND activatedAt IS NOT NULL THEN 1 END) AS active,
      COUNT(CASE WHEN disabled=0 AND activatedAt IS NULL THEN 1 END) AS pending,
      COUNT(CASE WHEN disabled=1 THEN 1 END) AS disabled FROM dbo.AuthUsers;`);
    const row = result.recordset[0];
    if (
      !row ||
      ![row.active, row.pending, row.disabled].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      )
    )
      throw new Error("Account summary unavailable.");
    return {
      active: row.active as number,
      pending: row.pending as number,
      disabled: row.disabled as number,
    };
  });
}
