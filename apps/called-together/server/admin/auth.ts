import "server-only";
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { Kysely, MssqlDialect } from "kysely";
import * as Tedious from "tedious";
import * as Tarn from "tarn";
import { connectionConfig } from "../database.ts";
import { adminConfig } from "./config.ts";
import { developmentDelivery, type EmailDelivery } from "./delivery.ts";

import { sessionCookieOptions } from "./session-cookie.ts";
import { authDiagnostic } from "./diagnostics.ts";
import { AuthSqlConnection, authPoolOptions } from "./sql-connection.ts";

export function authOptions(
  dependencies: {
    beginSession: (userId: string) => Promise<void>;
    recordSessionEvent: (
      userId: string,
      action: "sign_in" | "sign_out",
    ) => Promise<void>;
    completePassword: (userId: string) => Promise<void>;
    delivery: EmailDelivery;
  } = {
    beginSession: async () => {
      throw new Error("Application transaction required.");
    },
    recordSessionEvent: async () => {
      throw new Error("Application transaction required.");
    },
    completePassword: async () => {
      throw new Error("Application transaction required.");
    },
    delivery: developmentDelivery,
  },
  purpose: "setup" | "reset" = "reset",
) {
  const config = adminConfig();
  return {
    appName: "Called Together",
    baseURL: config.origin,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: [config.origin],
    logger: { disabled: true },
    // Better Call's non-API-error fallback prints raw errors even when the
    // Better Auth logger is disabled. Propagate to our sanitized boundary.
    onAPIError: { throw: true },
    telemetry: { enabled: false },
    disabledPaths: [
      "/sign-up/email",
      "/sign-in/email-otp",
      "/email-otp/send-verification-otp",
      "/email-otp/verify-email",
      "/email-otp/check-verification-otp",
      "/email-otp/create-verification-otp",
      "/email-otp/get-verification-otp",
      "/request-password-reset",
      "/reset-password",
      "/change-password",
      "/set-password",
      "/update-user",
      "/delete-user",
      "/change-email",
    ],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }: { user: { id: string } }) =>
        dependencies.completePassword(user.id),
    },
    account: { modelName: "AuthAccounts", accountLinking: { enabled: false } },
    user: {
      modelName: "AuthUsers",
      additionalFields: {
        disabled: {
          type: "boolean" as const,
          defaultValue: false,
          input: false,
        },
        actorId: { type: "string" as const, input: false, required: true },
      },
    },
    session: {
      modelName: "AuthSessions",
      expiresIn: config.sessionSeconds,
      disableSessionRefresh: true,
      deferSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    verification: {
      modelName:
        purpose === "setup" ? "AuthSetupVerifications" : "AuthVerifications",
      storeIdentifier: "hashed" as const,
    },
    // Application SQL throttle is multi-instance, atomic, always on, and cannot be bypassed with forged IP headers.
    rateLimit: { enabled: false },
    advanced: {
      trustedProxyHeaders: false,
      ipAddress: { ipAddressHeaders: [] },
      database: { generateId: () => randomUUID() },
      ...sessionCookieOptions,
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session: { userId: string }) => {
            await dependencies.beginSession(session.userId);
            return { data: session };
          },
          after: async (session: { userId: string }) =>
            dependencies.recordSessionEvent(session.userId, "sign_in"),
        },
        delete: {
          after: async (session: { userId: string }) =>
            dependencies.recordSessionEvent(session.userId, "sign_out"),
        },
      },
    },
    plugins: [
      emailOTP({
        disableSignUp: true,
        expiresIn: 300,
        otpLength: 8,
        allowedAttempts: 3,
        storeOTP: "hashed",
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== "forget-password")
            throw new Error("Unsupported email operation.");
          await dependencies.delivery.sendCode({ email, code: otp, purpose });
        },
      }),
    ],
  };
}
export function createAuthDatabase(onQueryError?: (error: unknown) => void) {
  // Kysely has its own lazy pool. Reuse the established CLI/managed-identity
  // selection, TLS policy and limits; never reuse a SQL migration identity in Azure.
  const settings = connectionConfig();
  const dialect = new MssqlDialect({
    tarn: { ...Tarn, options: authPoolOptions },
    tedious: {
      ...Tedious,
      TYPES: { ...Tedious.TYPES, DateTime: Tedious.TYPES.DateTime2 },
      connectionFactory: () => {
        authDiagnostic("database_connection", "kysely_connection", "start");
        try {
          const connection = new AuthSqlConnection({
            server: settings.server,
            authentication: settings.authentication,
            options: {
              database: settings.database,
              port: settings.port,
              encrypt: true,
              trustServerCertificate: false,
              connectTimeout: 15000,
              requestTimeout: 10000,
              appName: "Called Together authentication",
            },
          });
          connection.once("connect", (error) =>
            authDiagnostic(
              "database_connection",
              "kysely_connection",
              error ? "failed" : "ok",
              error,
            ),
          );
          return connection;
        } catch (error) {
          authDiagnostic(
            "database_connection",
            "kysely_connection",
            "failed",
            error,
          );
          throw error;
        }
      },
    },
  });
  return new Kysely<Record<string, never>>({
    dialect,
    log: (event) => {
      if (event.level === "error") {
        try {
          onQueryError?.(event.error);
        } catch {
          /* Observation must not change query behavior. */
        }
      }
      authDiagnostic(
        "query",
        "kysely_query",
        event.level === "error" ? "failed" : "ok",
        event.level === "error" ? event.error : undefined,
      );
    },
  });
}
export function createAuthWithDatabase(
  db: Kysely<Record<string, never>>,
  dependencies?: Parameters<typeof authOptions>[0],
  transaction = true,
  purpose: "setup" | "reset" = "reset",
) {
  return betterAuth({
    ...authOptions(dependencies, purpose),
    database: { db, type: "mssql", transaction },
  });
}
let instance: ReturnType<typeof createAuthWithDatabase> | undefined;
let authDatabase: ReturnType<typeof createAuthDatabase> | undefined;
export function getAuthDatabase() {
  return (authDatabase ??= createAuthDatabase());
}
export function auth() {
  return (instance ??= createAuthWithDatabase(getAuthDatabase()));
}
