import "server-only";
import sql from "mssql";
import { authStage } from "./diagnostics.ts";
import { diagnoseThrottleBinding } from "./throttle-binding.ts";

/** Shared by the application and owner-run verification; never interpolates SQL. */
export function createThrottle(request: () => Promise<sql.Request>) {
  return async (bucket: string, maximum: number): Promise<boolean> => {
    const sqlRequest = await request();
    const result = await authStage("query", "throttle", async () => {
      try {
        return await sqlRequest
          .input("Bucket", sql.VarChar(80), bucket)
          .input("Maximum", sql.Int, maximum)
          .execute("dbo.AuthThrottle");
      } catch (error) {
        diagnoseThrottleBinding(error, sqlRequest.parameters);
        throw error;
      }
    });
    return result.recordset[0]?.Allowed === true;
  };
}
