import "server-only";
import { emailConfig } from "./email-config.ts";
export class AdminConfigurationError extends Error {
  constructor() {
    super("Admin authentication is unavailable.");
  }
}
export interface AdminConfig {
  origin: string;
  secret: string;
  sessionKey: Uint8Array;
  sessionSeconds: number;
}
export function adminConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): AdminConfig {
  try {
    const origin = new URL(env.ADMIN_AUTH_ORIGIN ?? "");
    const secret = env.ADMIN_AUTH_SECRET ?? "";
    const key = Buffer.from(secret, "base64url");
    if (
      origin.protocol !== "https:" ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash ||
      origin.username ||
      origin.password ||
      key.length !== 32 ||
      key.toString("base64url") !== secret
    )
      throw new Error();
    const delivery = emailConfig(env);
    const local =
      env.NODE_ENV === "development" &&
      !env.WEBSITE_INSTANCE_ID &&
      !env.WEBSITE_SITE_NAME &&
      ["localhost", "127.0.0.1"].includes(origin.hostname);
    if (delivery.provider === "mailpit" && !local) throw new Error();
    // Configuration alone must never open deployed authentication.
    if (
      delivery.provider === "resend" &&
      !local &&
      (env.ADMIN_AUTH_ENABLED !== "1" || env.ADMIN_AUTH_OWNER_VERIFIED !== "1")
    )
      throw new Error();
    const sessionSeconds = Number(env.ADMIN_SESSION_SECONDS ?? "43200");
    if (
      !Number.isInteger(sessionSeconds) ||
      sessionSeconds < 3600 ||
      sessionSeconds > 604800
    )
      throw new Error();
    return { origin: origin.origin, secret, sessionKey: key, sessionSeconds };
  } catch {
    throw new AdminConfigurationError();
  }
}
export function configuredAdmin(): AdminConfig | null {
  try {
    return adminConfig();
  } catch {
    return null;
  }
}
export function safeAdminReturn(value: unknown): string {
  if (value === undefined || value === null || value === "") return "/admin";
  if (
    typeof value !== "string" ||
    value.length > 1024 ||
    /[\\\x00-\x20\x7f%]/.test(value) ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    throw new Error("Invalid return URL.");
  const parsed = new URL(value, "https://return.invalid");
  if (
    parsed.origin !== "https://return.invalid" ||
    (parsed.pathname !== "/admin" && !parsed.pathname.startsWith("/admin/")) ||
    parsed.pathname === "/admin/login" ||
    parsed.hash ||
    parsed.pathname !== value.split("?")[0]
  )
    throw new Error("Invalid return URL.");
  return parsed.pathname + parsed.search;
}
