import { Box, Button } from "@mui/material";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { SiteHeader } from "./site-header";

const meta = {
  title: "Components/SiteHeader",
  component: SiteHeader,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <>
        <Story />
        <Box
          component="main"
          sx={{ p: { xs: 2, sm: 4 }, overflowWrap: "anywhere", minWidth: 0 }}
        >
          <h1 id="overview">Overview</h1>
          <p>A fictional studio used to demonstrate site navigation.</p>
          <h2 id="updates">Updates</h2>
          <p>Example page content.</p>
          <h2 id="contact">Contact</h2>
        </Box>
      </>
    ),
  ],
} satisfies Meta<typeof SiteHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    brand: "Northfield Studio",
    brandHref: "#overview",
    links: [
      { label: "Overview", href: "#overview" },
      { label: "Updates", href: "#updates" },
      { label: "Contact", href: "#contact" },
    ],
  },
};
export const Minimal: Story = {
  args: { brand: "Northfield Studio", brandHref: "#overview" },
};
export const ActionsAndActiveNavigation: Story = {
  args: {
    ...Basic.args,
    logo: (
      <Box
        component="span"
        sx={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          bgcolor: "primary.main",
        }}
      />
    ),
    links: [
      { label: "Overview", href: "#overview", active: true },
      { label: "Updates", href: "#updates" },
    ],
    actions: <Button variant="outlined">Example action</Button>,
  },
};
export const LongerContent: Story = {
  args: {
    ...Basic.args,
    brand: "Northfield Studio for Creative Projects and Shared Ideas",
    links: [
      {
        label: "An introduction to the studio",
        href: "#overview",
        active: true,
      },
      { label: "Recent projects and studio updates", href: "#updates" },
      { label: "Ways to get in touch", href: "#contact" },
    ],
  },
};
export const MobileMenu: Story = {
  args: ActionsAndActiveNavigation.args,
  parameters: {
    viewport: {
      options: {
        mobile: {
          name: "Small screen",
          styles: { width: "375px", height: "812px" },
          type: "mobile",
        },
      },
    },
  },
  globals: { viewport: { value: "mobile", isRotated: false } },
  play: async ({ canvasElement }) => {
    const toggle = await within(canvasElement).findByRole("button", {
      name: "Open navigation",
    });
    await userEvent.click(toggle);
  },
};

export const SpanishContent: Story = {
  args: {
    brand: "Estudio de ejemplo para proyectos creativos e ideas compartidas",
    brandHref: "#overview",
    navigationLabel: "Navegación principal",
    menuLabels: { open: "Abrir navegación", close: "Cerrar navegación" },
    links: [
      {
        label: "Información general sobre nuestros proyectos creativos",
        href: "#overview",
        active: true,
      },
      {
        label: "Novedades, actividades y experiencias compartidas",
        href: "#updates",
      },
      {
        label: "Información de contacto y formas de participar",
        href: "#contact",
      },
    ],
    actions: (
      <Button variant="outlined">
        Una acción de ejemplo con una etiqueta más extensa
      </Button>
    ),
  },
};
const responsive = (
  width: number,
  height: number,
  type: "mobile" | "tablet" | "desktop",
) => ({
  parameters: {
    viewport: {
      options: {
        example: {
          name: `${width}px`,
          styles: { width: `${width}px`, height: `${height}px` },
          type,
        },
      },
    },
  },
  globals: { viewport: { value: "example", isRotated: false } },
});
const openSpanishMenu: Story["play"] = async ({ canvasElement }) => {
  await userEvent.click(
    await within(canvasElement).findByRole("button", {
      name: "Abrir navegación",
    }),
  );
};
export const Mobile320: Story = {
  args: SpanishContent.args,
  ...responsive(320, 900, "mobile"),
  play: openSpanishMenu,
};
export const Tablet: Story = {
  args: SpanishContent.args,
  ...responsive(768, 1024, "tablet"),
  play: openSpanishMenu,
};
export const Desktop: Story = {
  args: SpanishContent.args,
  ...responsive(1440, 900, "desktop"),
};
