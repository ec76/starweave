import { Box, Card, Stack, Typography } from "@mui/material";
import { SiteAnchor } from "../site-anchor";
import type { SiteLinkRenderer } from "../site-link";

export interface ResourceCardProps {
  title: string;
  href: string;
  description?: string;
  resourceType?: string;
  author?: string;
  language?: string;
  image?: { src: string; alt: string };
  supportingText?: string;
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  LinkComponent?: SiteLinkRenderer;
}

/** App supplies content, destinations, policy and formatted metadata. */
export function ResourceCard({
  title,
  href,
  description,
  resourceType,
  author,
  language,
  image,
  supportingText,
  headingLevel = 2,
  LinkComponent = "a",
}: ResourceCardProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <Card
      component="article"
      elevation={0}
      sx={{
        minWidth: 0,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        overflowWrap: "anywhere",
      }}
    >
      {image && (
        <Box
          component="img"
          src={image.src}
          alt={image.alt}
          loading="lazy"
          sx={{
            display: "block",
            width: "100%",
            aspectRatio: "16 / 9",
            objectFit: "cover",
          }}
        />
      )}
      <Stack spacing={2} sx={{ p: { xs: 2, sm: 3 } }}>
        {resourceType && (
          <Typography variant="body2" color="text.secondary">
            {resourceType}
          </Typography>
        )}
        <Typography component={Heading} variant="h3">
          <SiteAnchor
            href={href}
            LinkComponent={LinkComponent}
            color="text.primary"
            underline="always"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              maxWidth: "100%",
              "&:focus-visible, & > a:focus-visible": {
                outline: "2px solid",
                outlineColor: "primary.main",
                outlineOffset: 3,
              },
            }}
          >
            {title}
          </SiteAnchor>
        </Typography>
        {description && (
          <Typography color="text.secondary">{description}</Typography>
        )}
        {(author || language || supportingText) && (
          <Stack spacing={0.5}>
            {author && (
              <Typography variant="body2" color="text.secondary">
                {author}
              </Typography>
            )}
            {language && (
              <Typography variant="body2" color="text.secondary">
                {language}
              </Typography>
            )}
            {supportingText && (
              <Typography variant="body2" color="text.secondary">
                {supportingText}
              </Typography>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
