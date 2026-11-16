import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { stubAuthTestEnvironment } from "../auth-test-environment";
vi.mock("server-only", () => ({}));
vi.mock("../auth-controls", () => ({ AuthControls: () => null }));
import Login from "./page";

beforeEach(stubAuthTestEnvironment);
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
