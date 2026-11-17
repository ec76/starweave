import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { stubAuthTestEnvironment } from "../auth-test-environment";
vi.mock("server-only", () => ({}));
vi.mock("../auth-controls", () => ({ AuthControls: () => null }));
import Setup from "./page";

beforeEach(stubAuthTestEnvironment);
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
