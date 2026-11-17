// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { renderWithProviders } from "@repo/ui/test/render-with-providers";
import { AccountControls } from "./auth-controls";
import { ThemeProvider } from "../theme-provider";
import userEvent from "@testing-library/user-event";

const routing = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(routing.query),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows a recoverable invitation warning without calling a created account an invitation success", async () => {
  routing.query = "accountResult=invitation_pending";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ csrfToken: "a".repeat(43) })),
  );
  renderWithProviders(
    <ThemeProvider>
      <AccountControls accounts={[]} />
    </ThemeProvider>,
  );
  const notice = await screen.findByRole("alert");
  expect(notice.textContent).toContain("Account created");
  expect(notice.textContent).toContain("could not be confirmed");
  expect(notice.textContent).toContain("Do not create another account");
  expect(
    screen
      .getByRole("link", { name: "account setup page" })
      .getAttribute("href"),
  ).toBe("/admin/setup");
});

it("describes provider acceptance without promising inbox delivery", async () => {
  routing.query = "accountResult=invited";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ csrfToken: "a".repeat(43) })),
  );
  renderWithProviders(
    <ThemeProvider>
      <AccountControls accounts={[]} />
    </ThemeProvider>,
  );
  expect((await screen.findByRole("status")).textContent).toContain(
    "inbox delivery is not guaranteed",
  );
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps role choices independent in the invitation form", async () => {
  routing.query = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ csrfToken: "a".repeat(43) })),
  );
  const user = userEvent.setup();
  renderWithProviders(
    <ThemeProvider>
      <AccountControls accounts={[]} />
    </ThemeProvider>,
  );
  // Works with the current disclosure and the earlier combined account form.
  const disclosure = document.querySelector("details");
  if (disclosure) disclosure.open = true;
  await user.click(screen.getByRole("checkbox", { name: "Writer" }));
  await user.click(screen.getByRole("checkbox", { name: "Approver" }));
  const form = screen
    .getByRole("button", { name: "Create account" })
    .closest("form")!;
  expect(new FormData(form).getAll("roles")).toEqual(["Writer", "Approver"]);
  await user.click(screen.getByRole("checkbox", { name: "Administrator" }));
  expect(new FormData(form).getAll("roles")).toEqual([
    "Writer",
    "Approver",
    "Administrator",
  ]);
});
