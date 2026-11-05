import { ResourceCard } from "@repo/ui";
import { Box, Button, Container, Stack, Typography } from "@mui/material";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "./theme-provider";
import { tokens } from "./design-tokens";
import { SiteLayout } from "./site-layout";
import Home from "./page";

const meta = {
  title: "Called Together/Design system",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Standards: Story = {
  render: () => (
    <Container maxWidth="lg" sx={{ py: tokens.layout.section }}>
      <Stack spacing={tokens.layout.group}>
        <Typography variant="h1">Called Together design system</Typography>
        <Box>
          <Typography variant="h2">Colors</Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
              gap: tokens.layout.related,
              mt: 2,
            }}
          >
            {Object.entries(tokens.color).map(([name, value]) => (
              <Box
                key={name}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: tokens.radius.surface,
                  overflow: "hidden",
                }}
              >
                <Box sx={{ bgcolor: value, height: "4rem" }} />
                <Box sx={{ p: 2 }}>
                  {name}: {value}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
        <Typography variant="h2">Typography and reading column</Typography>
        <Typography variant="h3">A welcoming, readable hierarchy</Typography>
        <Typography sx={tokens.article}>
          Article body uses 18px type, a 1.75 line height, and a maximum width
          of 68ch. Keep long-form text left aligned inside the standard page
          container.
        </Typography>
        <Typography variant="body2">
          Metadata uses 14px type and a 1.5 line height.
        </Typography>
        <Typography variant="h2">Spacing</Typography>
        {(["inline", "related", "stack", "group"] as const).map((name) => (
          <Box key={name}>
            {name}: {tokens.layout[name] * 8}px
            <Box
              sx={{
                width: tokens.layout[name] * 8,
                height: 8,
                bgcolor: "primary.main",
              }}
            />
          </Box>
        ))}
        <Typography>
          Sections: 48 / 80px. Cards: 16 / 24px. Grid gaps: 16 / 24 / 32px.
          Container: 1200px including 16 / 24 / 32px gutters.
        </Typography>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
          <Button variant="contained">Primary action</Button>
          <Button variant="outlined">Secondary action</Button>
          <Button>Text action</Button>
        </Stack>
        <Box
          sx={{
            p: tokens.layout.card,
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: tokens.radius.surface,
          }}
        >
          White surface, subtle border, 12px corners; no shadow.
        </Box>
      </Stack>
    </Container>
  ),
};
export const Homepage: Story = {
  render: () => (
    <SiteLayout>
      <Home />
    </SiteLayout>
  ),
};

export const ResourceCards: Story = {
  render: () => (
    <Container sx={{ py: tokens.layout.section }}>
      <Typography variant="h1" sx={{ mb: 3 }}>
        Fictional resource previews
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0, 1fr)",
            sm: "repeat(2, minmax(0, 1fr))",
            md: "repeat(3, minmax(0, 1fr))",
          },
          gap: tokens.layout.grid,
        }}
      >
        <ResourceCard
          title="A fictional conversation notebook"
          href="#preview-destination"
          description="Sample content for reviewing the approved card appearance."
          resourceType="Article"
          author="Example author (fictional)"
          language="English"
          supportingText="8 min read"
        />
        <ResourceCard
          title="Una guía imaginaria para compartir ideas y experiencias en comunidad"
          href="#preview-destination"
          description="Contenido ficticio para revisar títulos extensos y descripciones en español."
          language="Español"
          resourceType="PDF"
          supportingText="PDF · 1.2 MB"
        />
        <ResourceCard
          title="A simple fictional preview"
          href="#preview-destination"
        />
      </Box>
      <Typography id="preview-destination" sx={{ mt: 4 }}>
        Preview destination only; these are fictional examples.
      </Typography>
    </Container>
  ),
};
