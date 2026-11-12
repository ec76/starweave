import "server-only";

import { accountEmail } from "../../domain/accounts.ts";

export function deliveryAddress(value: string): string {
  try {
    return accountEmail(value);
  } catch {
    throw new Error("Email configuration unavailable.");
  }
}
export function emailConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (env.AUTH_EMAIL_DELIVERY === "development-preview")
    return { provider: "mailpit" as const };
  if (env.AUTH_EMAIL_DELIVERY !== "resend")
    throw new Error("Email configuration unavailable.");
  const apiKey = env.RESEND_API_KEY ?? "";
  const address = deliveryAddress(env.AUTH_EMAIL_FROM_ADDRESS ?? "");
  const name = env.AUTH_EMAIL_FROM_NAME ?? "";
  if (
    !apiKey ||
    apiKey.length > 4096 ||
    /\s/.test(apiKey) ||
    !name ||
    name.length > 100 ||
    /[\x00-\x1f\x7f<>"\\]/.test(name)
  )
    throw new Error("Email configuration unavailable.");
  const allowlist =
    env.AUTH_EMAIL_RECIPIENT_ALLOWLIST === undefined
      ? null
      : env.AUTH_EMAIL_RECIPIENT_ALLOWLIST.split(",").map((entry) =>
          deliveryAddress(entry.trim()),
        );
  if (allowlist && (!allowlist.length || allowlist.length > 100))
    throw new Error("Email configuration unavailable.");
  return { provider: "resend" as const, apiKey, address, name, allowlist };
}
