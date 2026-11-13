import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AdminSession } from "../domain/admin-auth";

vi.mock("server-only", () => ({}));
vi.mock("./admin/auth", () => ({
  auth: () => ({
    api: { getSession: async () => ({ session: { id: "session" } }) },
  }),
}));
vi.mock("./admin/repository", () => ({
  accounts: { session: vi.fn(), manage: vi.fn() },
}));
vi.mock("./admin/notifications.ts", () => ({
  deliverAccountNotifications: vi.fn(),
}));

import { accounts } from "./admin/repository";
import { deliverAccountNotifications } from "./admin/notifications.ts";
import { csrfGet } from "./admin/handlers";
import { POST } from "../app/api/admin/accounts/route";

const origin = "https://localhost:3001";
const id = "11111111-1111-4111-8111-111111111111";
const administrator: AdminSession = {
  id,
  userId: id,
  actorId: id,
  email: "administrator@example.invalid",
  identity: {
    issuer: "urn:called-together:users",
    subject: id,
    displayName: "Administrator",
  },
  roles: ["Administrator"],
  expiresAt: Date.now() / 1000 + 3600,
};

async function invitation() {
  const proof = await csrfGet();
  const { csrfToken } = await proof.json();
  return new Request(origin + "/api/admin/accounts", {
    method: "POST",
    headers: {
      origin,
      cookie:
        proof.cookies
          .getAll()
          .map((c) => `${c.name}=${c.value}`)
          .join("; ") + "; session=fixture",
    },
    body: new URLSearchParams([
      ["csrfToken", csrfToken],
      ["action", "create"],
      ["email", "WRITER@example.invalid"],
      ["name", " Writer "],
      ["roles", "Writer"],
      ["roles", "Approver"],
      ["actor", "untrusted"],
    ]),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTH_DEBUG", "");
  vi.stubEnv("AUTH_EMAIL_DELIVERY", "development-preview");
  vi.stubEnv("ADMIN_AUTH_ORIGIN", origin);
  vi.stubEnv("ADMIN_AUTH_SECRET", Buffer.alloc(32, 7).toString("base64url"));
  vi.stubEnv("WEBSITE_SITE_NAME", "");
  vi.stubEnv("WEBSITE_INSTANCE_ID", "");
  vi.mocked(accounts.session).mockResolvedValue(administrator);
  vi.mocked(accounts.manage).mockResolvedValue();
});
afterEach(() => vi.unstubAllEnvs());

it("distinguishes a created account from an invitation whose delivery failed", async () => {
  vi.mocked(deliverAccountNotifications).mockRejectedValue(
    new Error("PRIVATE_PROVIDER_DETAILS"),
  );
  const response = await POST(await invitation());
  expect(response.status).toBe(303);
  expect(
    new URL(response.headers.get("location")!).searchParams.get(
      "accountResult",
    ),
  ).toBe("invitation_pending");
  expect(response.headers.get("location")).not.toContain("updated=1");
  expect(await response.text()).not.toContain("PRIVATE_PROVIDER_DETAILS");
  expect(accounts.manage).toHaveBeenCalledWith(id, {
    action: "create",
    email: "writer@example.invalid",
    name: "Writer",
    roles: ["Writer", "Approver"],
  });
});

it("reports invitation acceptance only after the outbox confirms a sent notification", async () => {
  vi.mocked(deliverAccountNotifications).mockResolvedValue(1);
  const response = await POST(await invitation());
  expect(response.status).toBe(303);
  expect(
    new URL(response.headers.get("location")!).searchParams.get(
      "accountResult",
    ),
  ).toBe("invited");
});

it("does not claim invitation acceptance when no pending notification was confirmed", async () => {
  vi.mocked(deliverAccountNotifications).mockResolvedValue(0);
  const response = await POST(await invitation());
  expect(
    new URL(response.headers.get("location")!).searchParams.get(
      "accountResult",
    ),
  ).toBe("invitation_pending");
});

it.each([null, ["Writer"], ["Approver"], ["Writer", "Approver"]] as const)(
  "rejects invitation without Administrator permission: %j",
  async (roles) => {
    vi.mocked(accounts.session).mockResolvedValue(
      roles ? { ...administrator, roles } : null,
    );
    const response = await POST(await invitation());
    expect(response.status).toBe(roles ? 403 : 401);
    expect(accounts.manage).not.toHaveBeenCalled();
    expect(deliverAccountNotifications).not.toHaveBeenCalled();
  },
);

it("does not send an invitation when persistence or live-session reauthorization rejects creation", async () => {
  vi.mocked(accounts.manage).mockRejectedValue(
    new Error("PRIVATE_SQL_DETAILS"),
  );
  const response = await POST(await invitation());
  expect(response.status).toBe(400);
  expect(deliverAccountNotifications).not.toHaveBeenCalled();
  expect(await response.text()).not.toContain("PRIVATE_SQL_DETAILS");
});

it("rejects cross-origin invitations before persistence or delivery", async () => {
  const request = await invitation();
  request.headers.set("origin", "https://foreign.invalid");
  expect((await POST(request)).status).toBe(403);
  expect(accounts.manage).not.toHaveBeenCalled();
  expect(deliverAccountNotifications).not.toHaveBeenCalled();
});

it.each(["grant_role", "revoke_role"])(
  "requires Administrator permission for %s",
  async (action) => {
    vi.mocked(accounts.session).mockResolvedValue({
      ...administrator,
      roles: ["Writer", "Approver"],
    });
    const request = await invitation();
    const fields = new URLSearchParams(await request.text());
    fields.set("action", action);
    fields.set("targetId", id);
    fields.set("role", "Administrator");
    const changed = new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: fields,
    });
    expect((await POST(changed)).status).toBe(403);
    expect(accounts.manage).not.toHaveBeenCalled();
  },
);
