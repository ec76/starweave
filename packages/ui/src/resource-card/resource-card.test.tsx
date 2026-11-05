import { forwardRef } from "react";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../test/render-with-providers";
import type { SiteLinkRendererProps } from "../site-link";
import { ResourceCard } from "./resource-card";
const Adapter = forwardRef<HTMLAnchorElement, SiteLinkRendererProps>(
  function Adapter(props, ref) {
    return <a {...props} ref={ref} data-adapter="true" />;
  },
);
describe("ResourceCard", () => {
  it("provides one title link within the chosen semantic heading and supports keyboard focus", async () => {
    renderWithProviders(
      <ResourceCard title="Sample" href="#sample" headingLevel={3} />,
    );
    const heading = screen.getByRole("heading", { level: 3, name: "Sample" });
    expect(within(heading).getByRole("link")).toHaveAttribute(
      "href",
      "#sample",
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("article")).toContainElement(heading);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    await userEvent.setup().tab();
    expect(screen.getByRole("link")).toHaveFocus();
  });
  it("renders optional content and removes it when omitted", () => {
    const { rerender } = renderWithProviders(
      <ResourceCard
        title="Sample"
        href="#sample"
        description="Description"
        resourceType="PDF"
        author="Fictional author"
        language="Español"
        supportingText="1.2 MB"
        image={{ src: "/sample.svg", alt: "Sample shapes" }}
      />,
    );
    for (const text of [
      "Description",
      "PDF",
      "Fictional author",
      "Español",
      "1.2 MB",
    ])
      expect(screen.getByText(text)).toBeVisible();
    expect(screen.getByRole("img", { name: "Sample shapes" })).toHaveAttribute(
      "src",
      "/sample.svg",
    );
    rerender(<ResourceCard title="Sample" href="#sample" />);
    for (const text of [
      "Description",
      "PDF",
      "Fictional author",
      "Español",
      "1.2 MB",
    ])
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
  it("renders a custom adapter as one anchor and permits decorative images", () => {
    const { container } = renderWithProviders(
      <ResourceCard
        title="Sample"
        href="/sample"
        LinkComponent={Adapter}
        image={{ src: "/sample.svg", alt: "" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Sample" })).toHaveAttribute(
      "data-adapter",
      "true",
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/sample");
    expect(container.querySelector("a a")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
