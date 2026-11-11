import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { classifyVerificationError } from "./error-classification.ts";

const stages = [
  "configuration",
  "database_connection",
  "query",
  "better_auth_initialization",
  "better_auth_request",
  "mailpit_delivery",
  "login",
  "admin_page",
  "session",
] as const;
const operations = [
  "login",
  "admin_configuration",
  "sql_configuration",
  "mssql_pool",
  "throttle",
  "eligibility",
  "better_auth_instance",
  "better_auth_handler",
  "kysely_connection",
  "kysely_query",
  "mailpit_send",
  "admin_page",
  "page_headers",
  "page_session",
  "session_lookup",
  "session_liveness",
  "session_account_invitation",
  "session_roles",
  "session_mapping",
  "admin_account_list",
  "admin_account_mapping",
  "credential_policy_lock",
  "credential_policy",
  "credential_action",
  "security_event",
  "activity_list",
  "account_notification",
  "account_management",
] as const;
type Stage = (typeof stages)[number];
type Operation = (typeof operations)[number];
type Outcome = "start" | "ok" | "failed" | "http_failure";
const context = new AsyncLocalStorage<{ active: boolean }>();
export function diagnosticsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.NODE_ENV === "development" &&
    env.AUTH_DEBUG === "1" &&
    !env.WEBSITE_INSTANCE_ID &&
    !env.WEBSITE_SITE_NAME
  );
}
export function authDiagnostic(
  stage: Stage,
  operation: Operation,
  outcome: Outcome,
  error?: unknown,
) {
  if (!context.getStore()?.active || !diagnosticsEnabled()) return;
  // Runtime allowlists also protect against future untyped callers passing data.
  const safeStage = stages.includes(stage) ? stage : "login";
  const safeOperation = operations.includes(operation) ? operation : "login";
  const safeOutcome = ["start", "ok", "failed", "http_failure"].includes(
    outcome,
  )
    ? outcome
    : "failed";
  const detail =
    error === undefined ? undefined : classifyVerificationError(error);
  console.info(
    "[called-together:auth-debug] " +
      JSON.stringify({
        stage: safeStage,
        operation: safeOperation,
        outcome: safeOutcome,
        ...(detail
          ? {
              reason: detail.classification,
              ...(detail.sqlNumber === null
                ? {}
                : { sqlNumber: detail.sqlNumber }),
              ...(detail.errorType ? { errorType: detail.errorType } : {}),
              ...(detail.driverCode ? { driverCode: detail.driverCode } : {}),
            }
          : {}),
      }),
  );
}
export function withAuthDiagnostics<T>(run: () => Promise<T>) {
  return context.run({ active: diagnosticsEnabled() }, run);
}
export function sessionBindingDiagnostic(detail: {
  actualType: string;
  length: number | null;
  typeMatches: boolean;
  requestClassMatches: boolean;
  failedParameter: "id" | "statement" | "params" | "unclassified";
  category: "invalid_string" | "sql_type_identity_unmapped" | "unclassified";
}) {
  if (!context.getStore()?.active || !diagnosticsEnabled()) return;
  console.info(
    "[called-together:auth-debug] " +
      JSON.stringify({
        stage: "query",
        operation: "session_binding",
        parameter: "id",
        failedParameter: ["id", "statement", "params"].includes(
          detail.failedParameter,
        )
          ? detail.failedParameter
          : "unclassified",
        expectedType: "nvarchar(36)",
        declaredLength: 36,
        actualType: jsTypes.includes(
          detail.actualType as (typeof jsTypes)[number],
        )
          ? detail.actualType
          : "unknown",
        actualLength:
          Number.isSafeInteger(detail.length) && detail.length! >= 0
            ? detail.length
            : null,
        sqlTypeMatches: detail.typeMatches === true,
        requestClassMatches: detail.requestClassMatches === true,
        connectionCollation: "not_observed_at_pool_boundary",
        collationRequiredByValidator: false,
        columnCollation: "Latin1_General_100_BIN2",
        category: ["invalid_string", "sql_type_identity_unmapped"].includes(
          detail.category,
        )
          ? detail.category
          : "unclassified",
      }),
  );
}
const bindingCategories = [
  "invalid_string",
  "invalid_number",
  "integer_range",
  "collation_missing",
  "collation_encoding_missing",
  "unclassified",
] as const;
const jsTypes = [
  "undefined",
  "object",
  "boolean",
  "number",
  "bigint",
  "string",
  "symbol",
  "function",
] as const;
/** Emit no values or free-form driver text, even for untyped callers. */
export function authThrottleBindingDiagnostic(detail: {
  parameter: "Bucket" | "Maximum";
  actualType: string;
  category: (typeof bindingCategories)[number];
}) {
  if (!context.getStore()?.active || !diagnosticsEnabled()) return;
  if (detail.parameter !== "Bucket" && detail.parameter !== "Maximum") return;
  console.info(
    "[called-together:auth-debug] " +
      JSON.stringify({
        stage: "query",
        operation: "throttle_binding",
        parameter: detail.parameter,
        expectedType: detail.parameter === "Bucket" ? "varchar(80)" : "int",
        actualType: jsTypes.includes(
          detail.actualType as (typeof jsTypes)[number],
        )
          ? detail.actualType
          : "unknown",
        category: bindingCategories.includes(detail.category)
          ? detail.category
          : "unclassified",
      }),
  );
}
/** Fixed boolean facts only; callers cannot supply arbitrary field names. */
export function authSessionDiagnostic(checks: {
  cookieHeaderPresent?: boolean;
  sessionCookiePresent?: boolean;
  librarySessionFound?: boolean;
  sqlSessionLive?: boolean;
  accountInvitationAuthorized?: boolean;
  rolesPresent?: boolean;
}) {
  if (!context.getStore()?.active || !diagnosticsEnabled()) return;
  console.info(
    "[called-together:auth-debug] " +
      JSON.stringify({
        stage: "session",
        operation: "session_checks",
        ...(checks.cookieHeaderPresent === undefined
          ? {}
          : { cookieHeaderPresent: checks.cookieHeaderPresent === true }),
        ...(checks.sessionCookiePresent === undefined
          ? {}
          : { sessionCookiePresent: checks.sessionCookiePresent === true }),
        ...(checks.librarySessionFound === undefined
          ? {}
          : { librarySessionFound: checks.librarySessionFound === true }),
        ...(checks.sqlSessionLive === undefined
          ? {}
          : { sqlSessionLive: checks.sqlSessionLive === true }),
        ...(checks.accountInvitationAuthorized === undefined
          ? {}
          : {
              accountInvitationAuthorized:
                checks.accountInvitationAuthorized === true,
            }),
        ...(checks.rolesPresent === undefined
          ? {}
          : { rolesPresent: checks.rolesPresent === true }),
      }),
  );
}
export async function authStage<T>(
  stage: Stage,
  operation: Operation,
  run: () => Promise<T>,
): Promise<T> {
  authDiagnostic(stage, operation, "start");
  try {
    const result = await run();
    authDiagnostic(stage, operation, "ok");
    return result;
  } catch (error) {
    authDiagnostic(stage, operation, "failed", error);
    throw error;
  }
}
export function authStageSync<T>(
  stage: Stage,
  operation: Operation,
  run: () => T,
): T {
  authDiagnostic(stage, operation, "start");
  try {
    const result = run();
    authDiagnostic(stage, operation, "ok");
    return result;
  } catch (error) {
    authDiagnostic(stage, operation, "failed", error);
    throw error;
  }
}
export function configurationDiagnostic(checks: {
  authConfigurationValid: boolean;
  sqlConfigurationValid: boolean;
  localOriginMatches: boolean;
  disposableTargetMatches: boolean;
}) {
  if (!context.getStore()?.active || !diagnosticsEnabled()) return;
  // Enumerate fixed flags; never spread an object that might gain sensitive keys.
  console.info(
    "[called-together:auth-debug] " +
      JSON.stringify({
        stage: "configuration",
        operation: "effective_configuration",
        authConfigurationValid: checks.authConfigurationValid === true,
        sqlConfigurationValid: checks.sqlConfigurationValid === true,
        localOriginMatches: checks.localOriginMatches === true,
        disposableTargetMatches: checks.disposableTargetMatches === true,
      }),
  );
}
