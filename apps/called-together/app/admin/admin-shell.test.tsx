// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../theme-provider";
import { AdminShell, AdminPageHeader } from "./admin-shell";
import { DashboardView } from "./dashboard-view";
import { AccountsView } from "./accounts/accounts-view";
import { AccountManagement } from "./admin-views";
afterEach(cleanup);
it("uses semantic slash breadcrumbs for page context without a corrupted separator", () => {
  render(
    <ThemeProvider>
      <AdminShell section="dashboard" roles={["Writer"]}>
        {null}
      </AdminShell>
    </ThemeProvider>,
  );
  const context = screen.getByRole("navigation", { name: "Page context" });
  expect(
    within(context)
      .getByRole("link", { name: "Called Together" })
      .getAttribute("href"),
  ).toBe("/");
  expect(
    within(context).getByText("Dashboard").getAttribute("aria-current"),
  ).toBe("page");
  expect(context.textContent).toContain("/");
  expect(context.textContent).not.toContain("?");
});
it("opens mobile navigation, marks the current page and restores focus on Escape", async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider>
      <AdminShell section="accounts" roles={["Administrator"]}>
        <AdminPageHeader title="Accounts" />
      </AdminShell>
    </ThemeProvider>,
  );
  const button = screen.getByRole("button", { name: "Menu" });
  await user.click(button);
  const nav = await screen.findByRole("navigation", {
    name: "Mobile administration",
  });
  expect(
    within(nav)
      .getByRole("link", { name: "Accounts" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(within(nav).queryByRole("link", { name: "Articles" })).toBeNull();
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(
      screen.queryByRole("navigation", { name: "Mobile administration" }),
    ).toBeNull(),
  );
  await waitFor(() => expect(document.activeElement).toBe(button));
});
it("gives a Writer a dashboard without administrative links or account metrics", () => {
  render(
    <ThemeProvider>
      <AdminShell section="dashboard" roles={["Writer"]}>
        <DashboardView administrator={false} />
      </AdminShell>
    </ThemeProvider>,
  );
  expect(screen.queryByRole("link", { name: "Accounts" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Activity" })).toBeNull();
  expect(screen.queryByText("Accounts now")).toBeNull();
  expect(screen.queryByRole("link", { name: "Articles" })).toBeNull();
});
it("submits filters as GET URL state, retains selection and exposes only working page links", () => {
  render(
    <ThemeProvider>
      <AccountsView
        filter={{ q: "Example", status: "pending", role: "Writer", page: 2 }}
        count={0}
        previous="/admin/accounts?q=Example&status=pending&role=Writer&page=1"
        next={null}
      >
        {null}
      </AccountsView>
    </ThemeProvider>,
  );
  const field = screen.getByRole("textbox", {
    name: "Name or email",
  }) as HTMLInputElement;
  expect(field.value).toBe("Example");
  expect(field.form?.method).toBe("get");
  expect(new URL(field.form!.action).pathname).toBe("/admin/accounts");
  expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe(
    "pending",
  );
  expect(
    screen.getByRole("link", { name: "Previous page" }).getAttribute("href"),
  ).toContain("role=Writer&page=1");
  expect(screen.queryByRole("link", { name: "Next page" })).toBeNull();
  expect(screen.getByText(/No matching accounts/)).toBeTruthy();
});

it("keeps result status consistent and binds native security forms to their own account", () => {
  const accounts = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Example ^ Name",
      email: "fixture@example.invalid",
      disabled: true,
      activatedAt: "2026-11-12T12:00:00.000Z",
      roles: ["Writer" as const],
    },
  ];
  render(
    <ThemeProvider>
      <AccountManagement accounts={accounts} csrfToken="" />
    </ThemeProvider>,
  );
  const row = within(
    screen.getByRole("list", { name: "Matching accounts" }),
  ).getByRole("listitem");
  expect(within(row).getByText("Status: Disabled")).toBeTruthy();
  expect(within(row).queryByText("Status: Active")).toBeNull();
  expect(
    within(row).getByRole("heading", { name: "Example ^ Name" }),
  ).toBeTruthy();
  const target = row.querySelector(
    'input[name="targetId"]',
  ) as HTMLInputElement;
  expect(target.value).toBe(accounts[0]!.id);
  expect(target.form!.getAttribute("action")).toBe("/api/admin/accounts");
  for (const button of within(row).getAllByRole("button"))
    expect((button as HTMLButtonElement).disabled).toBe(true);
});
