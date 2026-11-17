import { vi } from "vitest";

export function stubAuthTestEnvironment() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTH_EMAIL_DELIVERY", "development-preview");
  vi.stubEnv("ADMIN_AUTH_ORIGIN", "https://localhost:3001");
  vi.stubEnv("ADMIN_AUTH_SECRET", Buffer.alloc(32, 7).toString("base64url"));
  vi.stubEnv("WEBSITE_SITE_NAME", "");
  vi.stubEnv("WEBSITE_INSTANCE_ID", "");
}
