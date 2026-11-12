import { pathToFileURL } from "node:url";
import { configuredAdmin } from "../server/admin/config.ts";
import { deliverAccountNotifications } from "../server/admin/notifications.ts";
import { database } from "../server/database.ts";
export async function run(args: readonly string[]) {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--run"))
    throw new Error("Use [--run].");
  if (!args.length) {
    console.log(
      "Dry-run: no SQL or email delivery. Add --run to retry five pending safe-link notifications locally.",
    );
    return;
  }
  if (!configuredAdmin())
    throw new Error("Only configured local development delivery is supported.");
  try {
    await deliverAccountNotifications();
    console.log("Pending safe-link notification batch completed.");
  } finally {
    await database.close();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run(process.argv.slice(2)).catch(() => {
    console.error(
      "Notification batch unavailable. Pending rows remain for retry.",
    );
    process.exitCode = 1;
  });
