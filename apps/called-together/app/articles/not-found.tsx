import { Container, Link, Stack, Typography } from "@mui/material";
import { tokens } from "../design-tokens";
export default function ArticleNotFound() {
  return (
    <Container sx={{ py: tokens.layout.section }}>
      <Stack spacing={3}>
        <Typography component="h1" variant="h1">
          Article page not found
        </Typography>
        <Typography>
          The article may no longer be published, or the page address may be
          incorrect.
        </Typography>
        <Link
          href="/articles"
          sx={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
        >
          Browse articles
        </Link>
      </Stack>
    </Container>
  );
}
