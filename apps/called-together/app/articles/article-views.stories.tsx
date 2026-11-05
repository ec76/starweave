import { Container, Typography } from "@mui/material";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "../theme-provider";
import { ArticlesListing, ArticlePreview } from "./article-views";
import type { ArticleListingView } from "../../domain/article-pages";
const empty: ArticleListingView = {
  kind: "ready",
  cards: [],
  emptyHeading: "Articles are coming soon.",
  pageLabel: "Page 1",
  previousHref: null,
  nextHref: null,
};
const populated: ArticleListingView = {
  ...empty,
  cards: [
    {
      id: "fictional-one",
      title: "A fictional conversation notebook",
      href: "#fictional-preview",
      description:
        "Fictional preview copy used only to review the articles layout.",
      author: "By Example author (fictional)",
      language: "English",
      publication: "Published November 5, 2026",
    },
    {
      id: "fictional-two",
      title:
        "Un cuaderno imaginario para compartir preguntas y experiencias con nuestra comunidad",
      href: "#fictional-preview",
      description:
        "Contenido ficticio para comprobar la lectura de descripciones extensas en pantallas peque\u00f1as.",
      author:
        "By Nombre de autor de ejemplo deliberadamente extenso (ficticio)",
      language: "Espa\u00f1ol",
      publication: "Published November 5, 2026",
    },
    {
      id: "fictional-three",
      title: "Another fictional preview",
      href: "#fictional-preview",
      description:
        "No real article or endorsement is represented by this example.",
      author: "By Example contributor (fictional)",
      language: "English",
      publication: "Published November 5, 2026",
    },
  ],
  nextHref: "#fictional-preview",
};
const meta = {
  title: "Called Together/Articles",
  component: ArticlesListing,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
        <Container>
          <Typography id="fictional-preview">
            Fictional Storybook destination only.
          </Typography>
        </Container>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ArticlesListing>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = { args: { model: empty } };
export const Populated: Story = { args: { model: populated } };
export const Unavailable: Story = { args: { model: { kind: "unavailable" } } };
export const MiddlePage: Story = {
  args: {
    model: {
      ...populated,
      pageLabel: "Page 2",
      previousHref: "#fictional-preview",
    },
  },
};
export const LastPage: Story = {
  args: {
    model: {
      ...populated,
      pageLabel: "Page 3",
      previousHref: "#fictional-preview",
      nextHref: null,
    },
  },
};
export const DetailSummary: Story = {
  args: { model: empty },
  render: () => (
    <ArticlePreview
      model={{
        title: "A fictional conversation notebook",
        summary:
          "This fictional summary demonstrates the minimal detail page. No full article body is represented.",
        author: "Example author (fictional)",
        language: "English",
        languageTag: "en",
        firstPublished: {
          iso: "2026-11-01T12:00:00.000Z",
          label: "November 1, 2026",
        },
        published: {
          iso: "2026-11-05T12:00:00.000Z",
          label: "November 5, 2026",
        },
      }}
    />
  ),
};
export const Mobile320: Story = {
  ...Populated,
  parameters: {
    viewport: {
      options: {
        mobile: {
          name: "320px",
          styles: { width: "320px", height: "1000px" },
          type: "mobile",
        },
      },
    },
  },
  globals: { viewport: { value: "mobile", isRotated: false } },
};
