import { Box, Container, Link, Stack, Typography } from "@mui/material";
import { ResourceCard } from "@repo/ui";
import type {
  ArticleListingView,
  ArticlePreviewView,
  ArticlesUnavailableView,
} from "../../domain/article-pages";
import { tokens } from "../design-tokens";

const pageLink = {
  display: "inline-flex",
  alignItems: "center",
  minWidth: 44,
  minHeight: 44,
};
export function ArticlesUnavailable() {
  return (
    <Box
      role="status"
      sx={{
        p: tokens.layout.card,
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: tokens.radius.surface,
      }}
    >
      <Typography component="h2" variant="h3">
        Articles are temporarily unavailable.
      </Typography>
      <Typography sx={{ mt: 2 }}>Please try again later.</Typography>
      <Link href="/articles" sx={pageLink}>
        Try again
      </Link>
    </Box>
  );
}
export function ArticlesListing({
  model,
}: {
  model: ArticleListingView | ArticlesUnavailableView;
}) {
  return (
    <Container maxWidth="lg" sx={{ py: tokens.layout.section }}>
      <Stack spacing={tokens.layout.group}>
        <Box>
          <Typography component="h1" variant="h1">
            Articles
          </Typography>
          <Typography sx={{ mt: 2, maxWidth: tokens.layout.reading }}>
            Explore Scripture, practical guidance, and perspectives on women in
            spiritual leadership.
          </Typography>
        </Box>
        {model.kind === "unavailable" ? (
          <ArticlesUnavailable />
        ) : (
          <>
            {model.cards.length ? (
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
                {model.cards.map((card) => (
                  <ResourceCard
                    key={card.id}
                    title={card.title}
                    href={card.href}
                    headingLevel={2}
                    description={card.description}
                    resourceType="Article"
                    author={card.author}
                    language={card.language}
                    supportingText={card.publication}
                  />
                ))}
              </Box>
            ) : (
              <Box
                sx={{
                  p: tokens.layout.card,
                  bgcolor: "secondary.light",
                  borderRadius: tokens.radius.surface,
                }}
              >
                <Typography component="h2" variant="h3">
                  {model.emptyHeading}
                </Typography>
                <Typography sx={{ mt: 2 }}>
                  Thank you for being here. You can explore our starting points
                  while you wait.
                </Typography>
                <Link href="/#resource-hub" sx={pageLink}>
                  Explore the resource hub
                </Link>
              </Box>
            )}
            <Box
              component="nav"
              aria-label="Article pages"
              sx={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: tokens.layout.related,
              }}
            >
              {model.previousHref ? (
                <Link href={model.previousHref} rel="prev" sx={pageLink}>
                  Previous
                </Link>
              ) : (
                <Typography
                  component="span"
                  color="text.secondary"
                  aria-disabled="true"
                >
                  Previous
                </Typography>
              )}
              <Typography component="span" aria-current="page">
                {model.pageLabel}
              </Typography>
              {model.nextHref ? (
                <Link href={model.nextHref} rel="next" sx={pageLink}>
                  Next
                </Link>
              ) : (
                <Typography
                  component="span"
                  color="text.secondary"
                  aria-disabled="true"
                >
                  Next
                </Typography>
              )}
            </Box>
          </>
        )}
      </Stack>
    </Container>
  );
}
export function ArticlePreview({ model }: { model: ArticlePreviewView }) {
  return (
    <Container maxWidth="lg" sx={{ py: tokens.layout.section }}>
      <Stack spacing={tokens.layout.group}>
        <Link href="/articles" sx={pageLink}>
          Back to articles
        </Link>
        <Box
          component="article"
          lang={model.languageTag}
          sx={{ maxWidth: tokens.layout.reading }}
        >
          <Typography component="h1" variant="h1">
            {model.title}
          </Typography>
          <Typography sx={{ ...tokens.article, mt: 3 }}>
            {model.summary}
          </Typography>
          <Box
            component="dl"
            lang="en"
            sx={{
              my: 3,
              "& dt": { typography: "body2", color: "text.secondary" },
              "& dd": { m: 0, mb: 2 },
            }}
          >
            <Typography component="dt">Author</Typography>
            <Typography component="dd">{model.author}</Typography>
            <Typography component="dt">Language</Typography>
            <Typography component="dd">{model.language}</Typography>
            <Typography component="dt">First published</Typography>
            <Typography component="dd">
              <time dateTime={model.firstPublished.iso}>
                {model.firstPublished.label}
              </time>
            </Typography>
            <Typography component="dt">Published</Typography>
            <Typography component="dd">
              <time dateTime={model.published.iso}>
                {model.published.label}
              </time>
            </Typography>
          </Box>
        </Box>
        <Typography color="text.secondary">
          Full article text is not available on this page yet.
        </Typography>
      </Stack>
    </Container>
  );
}
