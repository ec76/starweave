import { forwardRef } from "react";
import { renderToString } from "react-dom/server";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/render-with-providers";
import type { SiteLinkRendererProps } from "../site-link";
import { SiteHeader } from "./site-header";

function viewport(mobile: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: !mobile,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 44,
    height: 44,
    top: 0,
    left: 0,
    right: 44,
    bottom: 44,
    toJSON: () => ({}),
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const links = [
  { label: "Overview", href: "#overview", active: true },
  { label: "Updates", href: "#updates" },
];
const Adapter = forwardRef<HTMLAnchorElement, SiteLinkRendererProps>(
  function Adapter(props, ref) {
    return <a {...props} ref={ref} />;
  },
);

describe("SiteHeader", () => {
  it("retains anchor navigation in server-rendered HTML", () => {
    const root = document.createElement("div");
    root.innerHTML = renderToString(
      <SiteHeader brand="Sample Studio" brandHref="/" links={links} />,
    );
    expect(
      [...root.querySelectorAll("nav a")].map((a) => a.getAttribute("href")),
    ).toEqual(["#overview", "#updates"]);
    expect(root.querySelector("a[aria-current=page]")).toHaveTextContent(
      "Overview",
    );
  });
  it("renders desktop links directly without duplicate menu controls", () => {
    viewport(false);
    renderWithProviders(
      <SiteHeader
        brand="Sample Studio"
        brandHref="/"
        logo={<span>Visual mark</span>}
        links={links}
        actions={<button>Search</button>}
      />,
    );
    expect(screen.getByRole("link", { name: "Sample Studio" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByText("Visual mark")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Open navigation" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Overview" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
  it("tabs through desktop links without a hidden menu stop", async () => {
    viewport(false);
    const user = userEvent.setup();
    renderWithProviders(
      <SiteHeader brand="Studio" brandHref="/" links={links} />,
    );
    await user.tab();
    expect(screen.getByRole("link", { name: "Studio" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Updates" })).toHaveFocus();
    expect(
      screen.queryByRole("dialog", { hidden: true }),
    ).not.toBeInTheDocument();
  });
  it("keeps closed mobile links out of keyboard navigation", async () => {
    viewport(true);
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <SiteHeader brand="Studio" brandHref="/" links={links} />
        <button>After header</button>
      </>,
    );
    await user.tab();
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "After header" })).toHaveFocus();
    expect(
      screen.queryByRole("link", { name: "Overview" }),
    ).not.toBeInTheDocument();
  });
  it("omits menu controls without links", () => {
    viewport(true);
    renderWithProviders(<SiteHeader brand="Sample Studio" brandHref="/" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
  for (const mobile of [true]) {
    it(`opens the ${mobile ? "mobile drawer" : "desktop dropdown"}, traps focus and restores it on Escape`, async () => {
      viewport(mobile);
      const user = userEvent.setup();
      renderWithProviders(
        <SiteHeader
          brand="Sample Studio"
          brandHref="/"
          links={links}
          navigationLabel="Site pages"
        />,
      );
      const trigger = screen.getByRole("button", { name: "Open navigation" });
      trigger.focus();
      await user.keyboard("{Enter}");
      const dialog = await screen.findByRole("dialog", { name: "Site pages" });
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(within(dialog).getByRole("navigation")).toHaveAttribute(
        "id",
        trigger.getAttribute("aria-controls"),
      );
      const close = within(dialog).getByRole("button", {
        name: "Close navigation",
      });
      close.focus();
      await user.tab();
      expect(screen.getByRole("link", { name: "Overview" })).toHaveFocus();
      expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await user.tab();
      expect(screen.getByRole("link", { name: "Updates" })).toHaveFocus();
      await user.tab();
      expect(close).toHaveFocus();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(trigger).toHaveFocus());
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });
  }
  it("closes after activating an adapted link without nested anchors", async () => {
    viewport(true);
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <SiteHeader
        brand="Sample Studio"
        brandHref="/"
        links={links}
        LinkComponent={Adapter}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(trigger);
    await user.click(await screen.findByRole("link", { name: "Overview" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(container.querySelector("a a")).toBeNull();
  });
  it("supports translated names and explicit close", async () => {
    viewport(true);
    const user = userEvent.setup();
    renderWithProviders(
      <SiteHeader
        brand="Estudio"
        brandHref="/"
        links={links}
        navigationLabel="Principal"
        menuLabels={{ open: "Abrir", close: "Cerrar" }}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Abrir" });
    await user.click(trigger);
    expect(
      await screen.findByRole("dialog", { name: "Principal" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
