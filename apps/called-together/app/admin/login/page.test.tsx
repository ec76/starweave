import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("../auth-controls", () => ({ AuthControls: () => null }));
import Login from "./page";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTH_EMAIL_DELIVERY", "development-preview");
  vi.stubEnv("ADMIN_AUTH_ORIGIN", "https://localhost:3001");
  vi.stubEnv("ADMIN_AUTH_SECRET", Buffer.alloc(32, 7).toString("base64url"));
  vi.stubEnv("WEBSITE_SITE_NAME", "");
  vi.stubEnv("WEBSITE_INSTANCE_ID", "");
});
afterEach(() => vi.unstubAllEnvs());

it("confirms completed setup on the sign-in destination only for its success state", async () => {
  const complete = renderToStaticMarkup(
    await Login({ searchParams: Promise.resolve({ setup: "complete" }) }),
  );
  const ordinary = renderToStaticMarkup(
    await Login({ searchParams: Promise.resolve({}) }),
  );
  expect(complete).toContain("Your account setup is complete");
  expect(ordinary).not.toContain("Your account setup is complete");
});
