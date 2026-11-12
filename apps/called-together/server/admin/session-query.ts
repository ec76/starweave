import sql from "mssql";
import { sessionBindingDiagnostic } from "./diagnostics.ts";
import { own } from "./error-classification.ts";

export async function sessionQuery(
  pool: sql.ConnectionPool,
  id: string,
  text: string,
) {
  const request = pool.request().input("id", sql.NVarChar(36), id);
  try {
    return await request.query(text);
  } catch (error) {
    // Recognize only fixed driver text internally; never print it or the value.
    const pending: unknown[] = [error];
    const seen = new Set<unknown>();
    let invalidString = false;
    let unmappedType = false;
    let failedParameter: "id" | "statement" | "params" | "unclassified" =
      "unclassified";
    for (let i = 0; pending.length && i < 12; i++) {
      const item = pending.shift();
      if (!item || typeof item !== "object" || seen.has(item)) continue;
      seen.add(item);
      const message = own(item, "message");
      if (message === "type.validate is not a function") unmappedType = true;
      if (own(item, "code") === "EPARAM" && typeof message === "string") {
        for (const name of ["id", "statement", "params"] as const) {
          if (
            message.startsWith(
              "Validation failed for parameter '" + name + "'. ",
            )
          )
            failedParameter = name;
        }
      }
      if (
        own(item, "code") === "EPARAM" &&
        own(item, "message") ===
          "Validation failed for parameter 'id'. Invalid string."
      )
        invalidString = true;
      pending.push(own(item, "cause"), own(item, "originalError"));
    }
    const parameter = request.parameters.id!;
    sessionBindingDiagnostic({
      actualType: typeof parameter.value,
      failedParameter,
      length:
        typeof parameter.value === "string" ? parameter.value.length : null,
      typeMatches: parameter.type === sql.NVarChar,
      requestClassMatches: request instanceof sql.Request,
      category:
        unmappedType && failedParameter !== "unclassified"
          ? "sql_type_identity_unmapped"
          : invalidString
            ? "invalid_string"
            : "unclassified",
    });
    throw error;
  }
}
