import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("./admin/access", () => ({ currentAdminSession: vi.fn() }));
vi.mock("./admin/account-search", () => ({
  searchAccounts: vi.fn(),
  accountCounts: vi.fn(),
}));
vi.mock("./admin/activity", () => ({ listActivity: vi.fn() }));
vi.mock("./admin/config", () => ({ adminConfig: vi.fn() }));
vi.mock("../app/admin/auth-controls", () => ({
  AuthControls: () => null,
  AccountControls: () => null,
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error("redirect:" + url);
  }),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));
import { currentAdminSession } from "./admin/access";
import { accountCounts, searchAccounts } from "./admin/account-search";
import { listActivity } from "./admin/activity";
import Dashboard from "../app/admin/page";
import AccountsPage from "../app/admin/accounts/page";
import { AdminLanding, AdminAccessDenied } from "../app/admin/admin-views";
import type { AdminSession } from "../domain/admin-auth";
const session = {
  id: "fixture",
  identity: { displayName: "Fixture" },
  roles: ["Administrator"],
} as unknown as AdminSession;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentAdminSession).mockResolvedValue(session);
  vi.mocked(accountCounts).mockResolvedValue({
    active: 2,
    pending: 1,
    disabled: 0,
  });
  vi.mocked(listActivity).mockResolvedValue({ events: [], hasMore: false });
  vi.mocked(searchAccounts).mockResolvedValue({ accounts: [], hasMore: false });
});
afterEach(() => vi.restoreAllMocks());
it.each(["Writer", "Approver"] as const)(
  "does not request any account or activity data for %s dashboard",
  async (role) => {
    vi.mocked(currentAdminSession).mockResolvedValue({
      ...session,
      roles: [role],
    });
    expect((await Dashboard()).type).toBe(AdminLanding);
    expect(accountCounts).not.toHaveBeenCalled();
    expect(listActivity).not.toHaveBeenCalled();
    expect(searchAccounts).not.toHaveBeenCalled();
  },
);
it("rejects Writer account search before fetching data", async () => {
  vi.mocked(currentAdminSession).mockResolvedValue({
    ...session,
    roles: ["Writer"],
  });
  expect((await AccountsPage({ searchParams: Promise.resolve({}) })).type).toBe(
    AdminAccessDenied,
  );
  expect(searchAccounts).not.toHaveBeenCalled();
});
it("redirects anonymous account search and rejects malformed pagination without querying", async () => {
  vi.mocked(currentAdminSession).mockResolvedValue(null);
  await expect(
    AccountsPage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow("returnTo=/admin/accounts");
  vi.mocked(currentAdminSession).mockResolvedValue(session);
  await expect(
    AccountsPage({ searchParams: Promise.resolve({ page: "10001" }) }),
  ).rejects.toThrow("not-found");
  expect(searchAccounts).not.toHaveBeenCalled();
});
it("keeps an authorized dashboard usable if optional counts and recent activity fail", async () => {
  vi.mocked(accountCounts).mockRejectedValue(new Error("PRIVATE"));
  vi.mocked(listActivity).mockRejectedValue(new Error("PRIVATE"));
  const page = await Dashboard();
  expect(page.type).toBe(AdminLanding);
  expect(page.props.summary).toEqual({ counts: null, events: null });
});

it("renders a safe retry state if the accounts page query fails", async () => {
  vi.mocked(searchAccounts).mockRejectedValue(new Error("PRIVATE_SENTINEL"));
  const html = renderToStaticMarkup(
    await AccountsPage({ searchParams: Promise.resolve({}) }),
  );
  expect(html).toContain("Account search is temporarily unavailable.");
  expect(html).toContain("Try account search again");
  expect(html).not.toContain("PRIVATE_SENTINEL");
});
