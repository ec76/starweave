// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@repo/ui/test/render-with-providers";
import { ProfileEditor } from "./profile-editor";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("retains edits locally until explicit Save and preserves them when a stale save is rejected", async () => {
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) =>
    options?.method === "POST"
      ? Response.json(
          { error: "Profile changed. Reload before saving." },
          { status: 409 },
        )
      : Response.json({ csrfToken: "a".repeat(43) }),
  );
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  renderWithProviders(<ProfileEditor profile={null} />);
  await user.type(
    screen.getByRole("textbox", { name: "Public display name" }),
    "Pen name",
  );
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(0);
  await user.click(await screen.findByRole("button", { name: "Save profile" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Profile changed",
  );
  expect(
    (
      screen.getByRole("textbox", {
        name: "Public display name",
      }) as HTMLInputElement
    ).value,
  ).toBe("Pen name");
});

it("saves the selected head explicitly, confirms success, and retains inspectable earlier content", async () => {
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) =>
    options?.method === "POST"
      ? Response.json({ saved: true })
      : Response.json({ csrfToken: "a".repeat(43) }),
  );
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  const id = "11111111-1111-4111-8111-111111111111";
  const head = "22222222-2222-4222-8222-222222222222";
  renderWithProviders(
    <ProfileEditor
      profile={{
        id,
        latestRevisionId: head,
        revisions: [
          {
            id: head,
            number: 2,
            displayName: "Current pen name",
            biography: "Current biography",
            photoUrl: "",
            photoAlt: "",
            affiliation: "Current group",
            savedBy: "Editor Two",
            actorId: "actor-two",
            savedAt: "2026-11-14T14:00:00.000Z",
          },
          {
            id: "old",
            number: 1,
            displayName: "Original pen name",
            biography: "Earlier biography",
            photoUrl: "https://example.invalid/old.jpg",
            photoAlt: "Earlier portrait",
            affiliation: "Earlier group",
            savedBy: "Editor One",
            actorId: "actor-one",
            savedAt: "2026-11-13T14:00:00.000Z",
          },
        ],
      }}
    />,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Biography" }),
    " revised",
  );
  await user.click(screen.getByRole("button", { name: "Save profile" }));
  expect(
    (
      await screen.findByRole("link", {
        name: "Continue editing and view saved history",
      })
    ).getAttribute("href"),
  ).toBe(`/admin/profiles?profile=${id}`);
  expect(screen.getByRole("status").textContent).toContain("Profile saved");
  expect(
    screen
      .getByRole("button", { name: "Save profile" })
      .hasAttribute("disabled"),
  ).toBe(true);
  const form = fetcher.mock.calls.find(
    ([, options]) => options?.method === "POST",
  )?.[1]?.body as FormData;
  expect(form.get("profileId")).toBe(id);
  expect(form.get("expectedRevisionId")).toBe(head);
  expect(form.get("biography")).toBe("Current biography revised");
  expect(screen.getByText("Biography: Earlier biography")).toBeTruthy();
  expect(screen.getByText(/Saved by Editor One/)).toBeTruthy();
  expect(screen.getByText("Photo description: Earlier portrait")).toBeTruthy();
});
