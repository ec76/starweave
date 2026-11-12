import sql from "mssql";
import { database } from "../../../../server/database";
import { configuredAdmin } from "../../../../server/admin/config";
import { adminJson } from "../../../../server/admin/handlers";
import { getAuthDatabase } from "../../../../server/admin/auth";
import { sql as authSql } from "kysely";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Explicit owner-run local-only disposable target check; no bypass or fixtures. */
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("database") ?? "";
  if (
    !configuredAdmin() ||
    process.env.AUTH_INTEGRATION !== "1" ||
    !/^ct_[a-z0-9_]+_auth_test$/.test(target) ||
    process.env.SQL_DATABASE !== target
  )
    return adminJson({ error: "Not found." }, 404);
  try {
    const expectedUser = process.env.AUTH_VERIFY_RUNTIME_USER;
    if (
      expectedUser !== undefined &&
      (!expectedUser || expectedUser.length > 128)
    )
      return adminJson({ ready: false }, 503);
    const result = await (
      await database.getPool()
    )
      .request()
      .input("Expected", sql.NVarChar(128), target)
      .input("RuntimeUser", sql.NVarChar(128), expectedUser ?? null)
      .query(
        `SELECT CAST(CASE WHEN DB_NAME()=@Expected THEN 1 ELSE 0 END AS bit) AS Ready,
        CAST(CASE WHEN @RuntimeUser IS NULL THEN 1 WHEN USER_ID()>4 AND IS_MEMBER(N'db_owner')=0
          AND USER_NAME() COLLATE Latin1_General_100_BIN2=@RuntimeUser COLLATE Latin1_General_100_BIN2
          THEN 1 ELSE 0 END AS bit) AS RuntimeMatch;`,
      );
    let runtimeMatches = result.recordset[0]?.RuntimeMatch === true;
    if (expectedUser) {
      const library = await authSql<{ RuntimeMatch: boolean }>`SELECT CAST(CASE
        WHEN DB_NAME()=${target} AND USER_ID()>4 AND IS_MEMBER(N'db_owner')=0
        AND USER_NAME() COLLATE Latin1_General_100_BIN2=${expectedUser} COLLATE Latin1_General_100_BIN2
        THEN 1 ELSE 0 END AS bit) AS RuntimeMatch;`.execute(getAuthDatabase());
      runtimeMatches = runtimeMatches && library.rows[0]?.RuntimeMatch === true;
    }
    return adminJson({
      ready: result.recordset[0]?.Ready === true && runtimeMatches,
      ...(expectedUser ? { runtimeIdentityMatches: runtimeMatches } : {}),
    });
  } catch {
    return adminJson({ ready: false }, 503);
  }
}
