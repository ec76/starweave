import { pathToFileURL } from "node:url";
import sql from "mssql";
import { adminConfig } from "../server/admin/config.ts";
import { deliverAccountNotifications } from "../server/admin/notifications.ts";
import { database, connectionConfig } from "../server/database.js";
import { accountEmail, accountName } from "../domain/accounts.js";
export function bootstrapArguments(args: readonly string[]) {
  const allowed = new Set(["--email", "--name", "--apply"]);
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!allowed.has(arg) || values.has(arg))
      throw new Error("Usage: --email address --name display-name [--apply]");
    if (arg === "--apply") values.set(arg, "true");
    else {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error("Missing argument.");
      values.set(arg, value);
    }
  }
  return {
    email: accountEmail(values.get("--email")),
    name: accountName(values.get("--name")),
    apply: values.has("--apply"),
  };
}
export async function run(args: readonly string[]) {
  if (process.env.WEBSITE_INSTANCE_ID || process.env.WEBSITE_SITE_NAME)
    throw new Error(
      "Bootstrap requires an authorized local operator identity.",
    );
  const options = bootstrapArguments(args),
    target = connectionConfig();
  console.log(
    "Target server: " + target.server + "; database: " + target.database,
  );
  if (!options.apply) {
    console.log(
      "Dry-run: no SQL connection or account change. Add --apply to bootstrap explicitly.",
    );
    return;
  }
  adminConfig();
  try {
    await (
      await database.getPool()
    )
      .request()
      .input("Email", sql.NVarChar(254), options.email)
      .input("Name", sql.NVarChar(200), options.name)
      .execute("dbo.AuthBootstrapAdministrator");
    await deliverAccountNotifications(undefined, options.email);
    console.log(
      "Initial pending administrator created. Notification sent to local Mailpit; request setup within seven days. No password was assigned.",
    );
  } finally {
    await database.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run(process.argv.slice(2)).catch(() => {
    console.error(
      "Administrator bootstrap failed. Check arguments, identity, target, migrations and existing administrator state.",
    );
    process.exitCode = 1;
  });
