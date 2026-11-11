import { Kysely } from "kysely";
/** Retain the driver transaction executor/connection/lifecycle guard, but expose
 * base connection() for Better Auth's MSSQL schema introspection. A Transaction
 * rejects that method. Do not reuse the root pool or disable schema validation.
 */
export function authTransaction<T>(
  db: Kysely<Record<string, never>>,
  run: (connection: Kysely<Record<string, never>>) => Promise<T>,
) {
  return db
    .transaction()
    .execute((transaction) =>
      run(
        Kysely.prototype.$extendTables.call(transaction) as Kysely<
          Record<string, never>
        >,
      ),
    );
}
