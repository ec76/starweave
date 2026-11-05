import { Box, Typography } from "@mui/material";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ResourceCard } from "./resource-card";
const meta = {
  title: "Components/ResourceCard",
  component: ResourceCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <>
        <Story />
        <Typography id="sample-resource" sx={{ mt: 4 }}>
          Fictional resource destination for this preview.
        </Typography>
      </>
    ),
  ],
} satisfies Meta<typeof ResourceCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Minimal: Story = {
  args: { title: "An imaginary field notebook", href: "#sample-resource" },
};
export const Article: Story = {
  args: {
    ...Minimal.args,
    resourceType: "Article",
    description:
      "A fictional guide to observing patterns in an imaginary garden.",
    author: "Example author (fictional)",
    language: "English",
    supportingText: "8 min read",
  },
};
export const PDF: Story = {
  args: {
    ...Minimal.args,
    resourceType: "PDF",
    description: "A sample worksheet for a fictional creative exercise.",
    language: "English",
    supportingText: "PDF · 1.2 MB",
  },
};
export const Video: Story = {
  args: {
    ...Minimal.args,
    resourceType: "Video",
    description: "A fictional demonstration of arranging simple shapes.",
    supportingText: "6 min",
    image: {
      src: "/sample-shapes.svg",
      alt: "Illustration of a circle and rectangle",
    },
  },
};
export const LongSpanishContent: Story = {
  args: {
    ...Minimal.args,
    title:
      "Un cuaderno imaginario para explorar nuevas ideas y compartir experiencias con nuestra comunidad creativa",
    description:
      "Contenido de demostración ficticio para comprobar la lectura y el espacio disponible cuando las descripciones ocupan varias líneas en pantallas pequeñas.",
    author: "Nombre de autor de ejemplo deliberadamente extenso (ficticio)",
    language: "Español",
    resourceType: "Artículo de ejemplo",
    supportingText: "8 minutos de lectura",
  },
};
export const ResponsiveGrid: Story = {
  args: Minimal.args,
  render: () => (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          sm: "repeat(2, minmax(0, 1fr))",
          md: "repeat(3, minmax(0, 1fr))",
        },
        gap: { xs: 2, sm: 3, md: 4 },
        alignItems: "stretch",
      }}
    >
      {[Minimal, Article, PDF, Video, LongSpanishContent].map((story, i) => (
        <ResourceCard key={i} {...Minimal.args} {...story.args} />
      ))}
    </Box>
  ),
};
