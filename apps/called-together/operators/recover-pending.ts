import { pathToFileURL } from "node:url";
import sql from "mssql";
import { accountEmail } from "../domain/accounts.ts";
import { adminConfig } from "../server/admin/config.ts";
import { database } from "../server/database.ts";
import { deliverAccountNotifications } from "../server/admin/notifications.ts";
export function recoveryArguments(args: readonly string[]) {
  if (
    args.length < 2 ||
    args.length > 3 ||
    args[0] !== "--email" ||
    (args[2] !== undefined && args[2] !== "--apply")
  )
    throw new Error("Use --email address [--apply].");
  return { email: accountEmail(args[1]), apply: args[2] === "--apply" };
}
export async function run(args: readonly string[]) {
  const options = recoveryArguments(args);
  adminConfig();
  if (!options.apply) {
    console.log(
      "Dry-run: no connection or change. Explicit recovery renews only the sole pending account; it never activates it or sets a password.",
    );
    return;
  }
  try {
    await (
      await database.getPool()
    )
      .request()
      .input("Email", sql.NVarChar(254), options.email)
      .execute("dbo.AuthRecoverPending");
    await deliverAccountNotifications();
    console.log(
      "Pending invitation renewed and safe-link notification retried. The user still must verify email and choose a password.",
    );
  } finally {
    await database.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run(process.argv.slice(2)).catch(() => {
    console.error(
      "Pending-account recovery rejected or unavailable. Review target, operator rights and sole-pending-account eligibility.",
    );
    process.exitCode = 1;
  });
