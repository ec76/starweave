import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("../auth-controls", () => ({ AuthControls: () => null }));
import Setup from "./page";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTH_EMAIL_DELIVERY", "development-preview");
  vi.stubEnv("ADMIN_AUTH_ORIGIN", "https://localhost:3001");
  vi.stubEnv("ADMIN_AUTH_SECRET", Buffer.alloc(32, 7).toString("base64url"));
  vi.stubEnv("WEBSITE_SITE_NAME", "");
  vi.stubEnv("WEBSITE_INSTANCE_ID", "");
});
afterEach(() => vi.unstubAllEnvs());

it("explains expired codes and invitations on setup failure without disclosing eligibility", async () => {
  const failed = renderToStaticMarkup(
    await Setup({ searchParams: Promise.resolve({ error: "1" }) }),
  );
  expect(failed).toContain("Codes expire after five minutes");
  expect(failed).toContain("if your invitation has expired");
  const requested = renderToStaticMarkup(
    await Setup({ searchParams: Promise.resolve({ sent: "1" }) }),
  );
  expect(requested).toContain(
    "If your account is eligible and email is available",
  );
  expect(requested).not.toContain("a code has been sent");
});
