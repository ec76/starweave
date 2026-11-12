import { TimeoutError as PoolTimeoutError } from "tarn";

export const driverClasses: Record<string, string> = {
  ELOGIN: "sql_authentication",
  ETIMEOUT: "driver_timeout",
  ESOCKET: "network_socket",
  ECONNRESET: "network_reset",
  ECONNREFUSED: "network_refused",
  ENOTFOUND: "dns_not_found",
  EAI_AGAIN: "dns_retry",
  EHOSTUNREACH: "network_unreachable",
  ENETUNREACH: "network_unreachable",
  EALREADYCONNECTED: "connection_already_connected",
  EALREADYCONNECTING: "connection_already_connecting",
  EINSTLOOKUP: "instance_lookup",
  ECANCEL: "request_cancelled",
  EINVALIDSTATE: "connection_invalid_state",
  ETIMEDOUT: "driver_timeout",
  EARGS: "sql_binding_arguments",
  EINJECT: "sql_binding_name",
  EDUPEPARAM: "sql_binding_duplicate",
  EPARAM: "sql_binding_validation",
  ENOCONN: "sql_connection_missing",
  ECONNCLOSED: "sql_connection_closed",
  ENOTOPEN: "sql_connection_not_open",
  CERT_HAS_EXPIRED: "tls_certificate_expired",
  DEPTH_ZERO_SELF_SIGNED_CERT: "tls_untrusted_certificate",
  SELF_SIGNED_CERT_IN_CHAIN: "tls_untrusted_certificate",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "tls_untrusted_certificate",
  ERR_TLS_CERT_ALTNAME_INVALID: "tls_hostname_mismatch",
};
export const errorTypes = [
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
  "SqlConfigurationError",
  "AdminConfigurationError",
  "CredentialUnavailableError",
  "AuthenticationError",
  "AggregateAuthenticationError",
  "AuthenticationRequiredError",
  "AbortError",
  "TimeoutError",
];
export const errorClassifications: Record<string, string> = {
  TypeError: "type_error",
  ReferenceError: "reference_error",
  RangeError: "range_error",
  SyntaxError: "syntax_error",
  URIError: "uri_error",
  SqlConfigurationError: "configuration_invalid",
  AdminConfigurationError: "configuration_invalid",
  CredentialUnavailableError: "credential_unavailable",
  AuthenticationError: "authentication_failed",
  AggregateAuthenticationError: "authentication_failed",
  AuthenticationRequiredError: "authentication_failed",
  AbortError: "aborted",
  TimeoutError: "timeout",
};
function safeErrorType(error: unknown): string {
  if (error instanceof PoolTimeoutError) return "TimeoutError";
  const name = own(error, "name");
  if (typeof name === "string" && errorTypes.includes(name)) return name;
  if (error instanceof TypeError) return "TypeError";
  if (error instanceof RangeError) return "RangeError";
  if (error instanceof ReferenceError) return "ReferenceError";
  if (error instanceof SyntaxError) return "SyntaxError";
  if (error instanceof URIError) return "URIError";
  if (error instanceof EvalError) return "EvalError";
  if (error instanceof AggregateError) return "AggregateError";
  return error instanceof Error ? "Error" : "unknown";
}
export const sqlClasses: Record<number, string> = {
  53201: "account_busy",
  53202: "bootstrap_existing_accounts",
  53203: "account_operation_invalid",
  53204: "administrator_required",
  53205: "last_active_administrator",
  53206: "audit_transaction_required",
  53207: "account_unavailable",
  53208: "pending_recovery_ineligible",
  53220: "audit_history_immutable",
  207: "sql_column_missing",
  208: "sql_object_missing",
  229: "sql_permission_denied",
  241: "sql_date_conversion",
  242: "sql_date_conversion",
  266: "sql_transaction_count_mismatch",
  547: "sql_constraint",
  1205: "sql_deadlock",
  1222: "sql_lock_timeout",
  2601: "sql_duplicate",
  2627: "sql_duplicate",
  2628: "sql_truncation",
  2812: "sql_procedure_missing",
  3902: "sql_transaction_missing",
  3903: "sql_transaction_missing",
  3930: "sql_transaction_uncommittable",
  8152: "sql_truncation",
  18456: "sql_authentication",
};
export function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return;
  try {
    const property = Object.getOwnPropertyDescriptor(value, key);
    return property && "value" in property ? property.value : undefined;
  } catch {
    return undefined;
  }
}
/** Read only data properties on a bounded graph; never touch message/stack/JSON/getters. */
export function classifyVerificationError(error: unknown): {
  kind:
    "sql_exception" | "library_error" | "assertion" | "unexpected_exception";
  classification: string;
  sqlNumber: number | null;
  errorType?: string;
  driverCode?: string;
} {
  const pending: unknown[] = [error],
    seen = new Set<unknown>();
  let sqlError = false,
    loginError = false;
  let driverDetail: ReturnType<typeof classifyVerificationError> | undefined;
  for (let i = 0; pending.length && i < 12; i++) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const code = own(current, "code"),
      name = own(current, "name"),
      number = own(current, "number");
    if (typeof code === "string" && Object.hasOwn(driverClasses, code))
      driverDetail = {
        kind: "sql_exception",
        classification: driverClasses[code]!,
        sqlNumber: null,
        driverCode: code,
      };
    else if (!driverDetail && errorClassifications[safeErrorType(current)])
      driverDetail = {
        kind: "unexpected_exception",
        classification:
          current instanceof PoolTimeoutError
            ? "pool_timeout"
            : errorClassifications[safeErrorType(current)]!,
        sqlNumber: null,
        errorType: safeErrorType(current),
      };
    const recognized =
      code === "EREQUEST" || name === "RequestError" || code === "ELOGIN";
    sqlError ||= recognized;
    if (
      (recognized || sqlError) &&
      typeof number === "number" &&
      Number.isSafeInteger(number) &&
      number > 0 &&
      number <= 2147483647
    )
      return {
        kind: "sql_exception",
        classification: sqlClasses[number] ?? "sql_other",
        sqlNumber: number,
      };
    if (code === "ELOGIN") loginError = true;
    for (const key of ["cause", "originalError", "info"]) {
      const next = own(current, key);
      if (next) pending.push(next);
    }
    for (const key of ["errors", "precedingErrors"]) {
      const list = own(current, key);
      if (Array.isArray(list))
        for (let index = 0; index < Math.min(list.length, 3); index++) {
          const item = own(list, String(index));
          if (item) pending.push(item);
        }
    }
    // Tedious may put the SQL number in an info node without repeating code.
    const info = own(current, "info"),
      infoNumber = own(info, "number");
    if (
      recognized &&
      typeof infoNumber === "number" &&
      Number.isSafeInteger(infoNumber) &&
      infoNumber > 0 &&
      infoNumber <= 2147483647
    )
      return {
        kind: "sql_exception",
        classification: sqlClasses[infoNumber] ?? "sql_other",
        sqlNumber: infoNumber,
      };
  }
  if (driverDetail) return driverDetail;
  return {
    kind: sqlError ? "sql_exception" : "unexpected_exception",
    classification: loginError
      ? "sql_authentication"
      : sqlError
        ? "sql_other"
        : (errorClassifications[safeErrorType(error)] ?? "unclassified"),
    sqlNumber: null,
    ...(!sqlError ? { errorType: safeErrorType(error) } : {}),
  };
}
