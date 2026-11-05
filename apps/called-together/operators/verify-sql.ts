import { pathToFileURL } from "node:url";
import { database, sqlFailureMessage } from "../server/database.js";
import { publicArticlesSelectProbe } from "../server/public-article-query.js";

export function sqlVerificationMode(
  args: readonly string[],
): "connection" | "public-articles" {
  if (args.length === 0) return "connection";
  if (args.length === 1 && args[0] === "--public-articles")
    return "public-articles";
  throw new Error("Use no options or --public-articles alone.");
}
export async function verifySql(
  connection = database,
  mode: "connection" | "public-articles" = "connection",
): Promise<number> {
  let result = 0;
  try {
    const pool = await connection.getPool();
    if (mode === "public-articles") {
      const response = await pool.request().query(publicArticlesSelectProbe);
      if (!Array.isArray(response.recordset) || response.recordset.length > 1)
        throw new Error("Unexpected verification result");
    } else {
      const response = await pool
        .request()
        .query<{ ok: number }>("SELECT 1 AS ok");
      if (response.recordset.length !== 1 || response.recordset[0]?.ok !== 1)
        throw new Error("Unexpected verification result");
    }
  } catch (error) {
    console.error(sqlFailureMessage(error));
    result = 1;
  } finally {
    try {
      await connection.close();
    } catch {
      console.error(
        "SQL verification failed: connection cleanup did not complete.",
      );
      result = 1;
    }
  }
  if (result === 0)
    console.log(
      mode === "public-articles"
        ? "PublicArticles SELECT verification succeeded (zero rows is valid)."
        : "SQL verification succeeded: ok=1.",
    );
  return result;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await verifySql(
      database,
      sqlVerificationMode(process.argv.slice(2)),
    );
  } catch {
    console.error("Use no options or --public-articles alone.");
    process.exitCode = 1;
  }
}
