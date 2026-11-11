import "server-only";
import sql from "mssql";
import { database } from "../database.ts";
import { developmentDelivery, type EmailDelivery } from "./delivery.ts";
import { authStage } from "./diagnostics.ts";
/** At-least-once safe-link notifications; no bearer credentials in this outbox. */
export async function deliverAccountNotifications(
  delivery: EmailDelivery = developmentDelivery,
  email?: string,
) {
  return authStage("mailpit_delivery", "account_notification", async () => {
    const pool = await database.getPool();
    const rows = await pool
      .request()
      .input("Email", sql.NVarChar(254), email ?? null)
      .query(
        `SELECT TOP (5) n.UserId,u.email FROM dbo.AuthNotifications n JOIN dbo.AuthUsers u ON u.id=n.UserId WHERE n.DeliveredAt IS NULL AND u.disabled=0 AND (@Email IS NULL OR u.email=@Email) ORDER BY n.CreatedAt;`,
      );
    for (const row of rows.recordset) {
      await delivery.accountCreated({ email: row.email });
      await pool
        .request()
        .input("UserId", sql.NVarChar(36), row.UserId)
        .query(
          "UPDATE dbo.AuthNotifications SET DeliveredAt=SYSUTCDATETIME() WHERE UserId=@UserId AND DeliveredAt IS NULL;",
        );
    }
  });
}
