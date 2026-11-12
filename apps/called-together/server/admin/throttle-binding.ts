import { own } from "./error-classification.ts";
import { authThrottleBindingDiagnostic } from "./diagnostics.ts";

// Exact installed Tedious validation messages are recognized internally only.
// Never emit a driver message or infer a parameter from arbitrary error text.
const categories = new Map<
  string,
  Parameters<typeof authThrottleBindingDiagnostic>[0]["category"]
>([
  ["Invalid string.", "invalid_string"],
  ["Invalid number.", "invalid_number"],
  [
    "Value must be between -2147483648 and 2147483647, inclusive.",
    "integer_range",
  ],
  [
    "No collation was set by the server for the current connection.",
    "collation_missing",
  ],
  [
    "The collation set by the server has no associated encoding.",
    "collation_encoding_missing",
  ],
]);

export function diagnoseThrottleBinding(error: unknown, parameters: unknown) {
  const pending = [error],
    seen = new Set<unknown>();
  for (let i = 0; pending.length && i < 12; i++) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    if (own(current, "code") === "EPARAM") {
      const message = own(current, "message");
      if (typeof message === "string") {
        for (const parameter of ["Bucket", "Maximum"] as const) {
          const prefix =
            "Validation failed for parameter '" + parameter + "'. ";
          if (!message.startsWith(prefix)) continue;
          const category =
            categories.get(message.slice(prefix.length)) ?? "unclassified";
          const value = own(own(parameters, parameter), "value");
          authThrottleBindingDiagnostic({
            parameter,
            actualType: typeof value,
            category,
          });
          return;
        }
      }
    }
    for (const key of ["cause", "originalError"]) {
      const next = own(current, key);
      if (next) pending.push(next);
    }
  }
}
