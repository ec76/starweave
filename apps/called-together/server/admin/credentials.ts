import "server-only";
import { sql, type Kysely } from "kysely";
import { createAuthWithDatabase, getAuthDatabase } from "./auth.ts";
import { configuredDelivery, type EmailDelivery } from "./delivery.ts";
import { authStage } from "./diagnostics.ts";
import { authTransaction } from "./transaction.ts";

export type CredentialAction =
  | "login"
  | "logout"
  | "setup-code"
  | "setup-finish"
  | "reset-code"
  | "reset-finish";
export interface CredentialInput {
  email?: string;
  password?: string;
  code?: string;
}
const endpoints: Record<CredentialAction, string> = {
  login: "/sign-in/email",
  logout: "/sign-out",
  "setup-code": "/email-otp/request-password-reset",
  "reset-code": "/email-otp/request-password-reset",
  "setup-finish": "/email-otp/reset-password",
  "reset-finish": "/email-otp/reset-password",
};
/** The route allowlist is explicit; no caller may select a library endpoint. */
export async function credentialOperation(
  action: CredentialAction,
  input: CredentialInput,
  request: Request,
  db: Kysely<Record<string, never>> = getAuthDatabase(),
  delivery: EmailDelivery = configuredDelivery,
): Promise<Response> {
  return authTransaction(db, async (transaction) => {
    // One shared lock serializes activation/reset with administrative changes.
    await authStage("query", "credential_policy_lock", () =>
      sql`
      DECLARE @lock int;
      EXEC @lock=sys.sp_getapplock @Resource=N'CalledTogether:accounts:administration',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=5000;
      IF @lock<0 THROW 53201,'Account administration is busy.',1;`.execute(
        transaction,
      ),
    );
    const purpose = action.startsWith("setup-") ? "setup" : "reset";
    if (action !== "logout") {
      const pending = purpose === "setup";
      const policy = await authStage("query", "credential_policy", () =>
        sql<{ id: string }>`
        SELECT u.id FROM dbo.AuthUsers u JOIN dbo.AuthInvitations i ON i.UserId=u.id
        WHERE u.email=${input.email} AND u.disabled=0
        AND ((${pending ? 1 : 0}=1 AND u.activatedAt IS NULL AND (i.AcceptedAt IS NOT NULL OR i.ExpiresAt>SYSUTCDATETIME()))
          OR (${pending ? 1 : 0}=0 AND u.activatedAt IS NOT NULL AND u.emailVerified=1 AND i.AcceptedAt IS NOT NULL));`.execute(
          transaction,
        ),
      );
      if (policy.rows.length !== 1 && action !== "login")
        return new Response(null, { status: 400 });
    }
    const instance = createAuthWithDatabase(
      transaction,
      {
        delivery,
        beginSession: async (userId) => {
          await sql`EXEC dbo.AuthBeginSession @UserId=${userId}`.execute(
            transaction,
          );
        },
        recordSessionEvent: async (userId, event) => {
          if (
            (action === "login" && event === "sign_in") ||
            (action === "logout" && event === "sign_out")
          )
            await sql`EXEC dbo.AuthRecordSessionEvent @UserId=${userId},@Action=${event}`.execute(
              transaction,
            );
        },
        completePassword: async (userId) => {
          await sql`EXEC dbo.AuthCompletePassword @UserId=${userId},@Purpose=${purpose}`.execute(
            transaction,
          );
        },
      },
      false,
      purpose,
    );
    const body =
      action === "logout"
        ? {}
        : action === "login"
          ? { email: input.email, password: input.password, rememberMe: true }
          : action.endsWith("-code")
            ? { email: input.email }
            : { email: input.email, otp: input.code, password: input.password };
    const response = await authStage(
      "better_auth_request",
      "better_auth_handler",
      () =>
        instance.handler(
          new Request(new URL("/api/auth" + endpoints[action], request.url), {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin: request.headers.get("origin") ?? "",
              cookie: request.headers.get("cookie") ?? "",
            },
            body: JSON.stringify(body),
          }),
        ),
    );
    // Unexpected storage/hook errors propagate and roll back. Expected library
    // rejection responses commit only OTP attempt accounting. No custom grants.
    return response;
  });
}
