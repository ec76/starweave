import { afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  authStage,
  withAuthDiagnostics,
  authSessionDiagnostic,
} from "./admin/diagnostics";
import { classifyVerificationError } from "./admin/error-classification";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("retains bounded nested SQL evidence without reading values, messages, getters or serializing errors", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTH_DEBUG", "1");
  vi.stubEnv("WEBSITE_SITE_NAME", "");
  vi.stubEnv("WEBSITE_INSTANCE_ID", "");
  const log = vi.spyOn(console, "info").mockImplementation(() => {}),
    getter = vi.fn(() => "PRIVATE_SENTINEL");
  const error = Object.defineProperty(
    {
      cause: { code: "EREQUEST", originalError: { info: { number: 229 } } },
      parameters: "PRIVATE_SENTINEL",
    },
    "message",
    { get: getter },
  );
  await withAuthDiagnostics(async () => {
    await expect(
      authStage("query", "admin_account_list", async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    authSessionDiagnostic({ sessionCookiePresent: true });
  });
  const output = JSON.stringify(log.mock.calls);
  expect(output).toContain("sql_permission_denied");
  expect(output).toContain("229");
  expect(output).not.toContain("PRIVATE_SENTINEL");
  expect(getter).not.toHaveBeenCalled();
});
it.each(["production", "azure", "disabled"])(
  "keeps diagnostics closed for %s",
  async (mode) => {
    vi.stubEnv(
      "NODE_ENV",
      mode === "production" ? "production" : "development",
    );
    vi.stubEnv("AUTH_DEBUG", mode === "disabled" ? "" : "1");
    vi.stubEnv("WEBSITE_SITE_NAME", mode === "azure" ? "deployed" : "");
    vi.stubEnv("WEBSITE_INSTANCE_ID", "");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await withAuthDiagnostics(async () => {
      await authStage("query", "credential_policy", async () => true);
    });
    expect(log).not.toHaveBeenCalled();
  },
);
it("classifies driver validation, deadlock and bounded unknown numbers safely", () => {
  expect(classifyVerificationError({ code: "EPARAM" }).classification).toBe(
    "sql_binding_validation",
  );
  expect(
    classifyVerificationError({ code: "EREQUEST", number: 1205 })
      .classification,
  ).toBe("sql_deadlock");
  expect(
    classifyVerificationError({ code: "EREQUEST", number: 99999 }).sqlNumber,
  ).toBe(99999);
  expect(
    classifyVerificationError({
      code: "EREQUEST",
      number: Number.POSITIVE_INFINITY,
    }).sqlNumber,
  ).toBeNull();
});
