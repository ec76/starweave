import sql from "mssql";
import { database } from "../../../../server/database";
import { configuredAdmin } from "../../../../server/admin/config";
import { adminJson } from "../../../../server/admin/handlers";
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
    const result = await (
      await database.getPool()
    )
      .request()
      .input("Expected", sql.NVarChar(128), target)
      .query(
        "SELECT CAST(CASE WHEN DB_NAME()=@Expected THEN 1 ELSE 0 END AS bit) AS Ready;",
      );
    return adminJson({ ready: result.recordset[0]?.Ready === true });
  } catch {
    return adminJson({ ready: false }, 503);
  }
}
