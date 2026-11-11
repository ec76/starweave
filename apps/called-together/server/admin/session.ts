import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import type { AdminConfig } from "./config";
export {
  AdminAccessError,
  requireAuthentication,
  requireEditorialRole,
  requireRoles,
} from "../../domain/accounts";
export const adminCookies = { csrf: "__Host-ct-admin-csrf" } as const;
export const flowSeconds = 300;
export const freshToken = () => randomBytes(32).toString("base64url");
export function cookieValue(
  header: string | null,
  name: string,
): string | undefined {
  const matches = (header ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(name + "="));
  if (matches.length !== 1) return;
  const value = matches[0]!.slice(name.length + 1);
  return value.length <= 3800 ? value : undefined;
}
export function equalToken(a: unknown, b: unknown): boolean {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(a) &&
    /^[A-Za-z0-9_-]{43}$/.test(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export async function seal(
  config: AdminConfig,
  csrfToken: string,
  now = Math.floor(Date.now() / 1000),
) {
  return new EncryptJWT({ csrfToken })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer(config.origin)
    .setAudience("called-together:csrf")
    .setIssuedAt(now)
    .setExpirationTime(now + flowSeconds)
    .encrypt(config.sessionKey);
}
export async function open(config: AdminConfig, token: string | undefined) {
  if (!token) return null;
  try {
    return (
      await jwtDecrypt(token, config.sessionKey, {
        issuer: config.origin,
        audience: "called-together:csrf",
        keyManagementAlgorithms: ["dir"],
        contentEncryptionAlgorithms: ["A256GCM"],
        requiredClaims: ["iat", "exp"],
        maxTokenAge: flowSeconds,
      })
    ).payload;
  } catch {
    return null;
  }
}
