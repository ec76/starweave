import { SiteAnchor } from "../site-anchor";
import { Box, Container, Stack } from "@mui/material";
import type { ReactNode } from "react";
import { HeaderNavigation } from "./header-navigation";
import type { SiteLinkRenderer, SiteNavigationLink } from "../site-link";

export interface SiteHeaderProps {
  brand: string;
  brandHref: string;
  logo?: ReactNode;
  links?: readonly SiteNavigationLink[];
  actions?: ReactNode;
  navigationLabel?: string;
  menuLabels?: { open: string; close: string };
  LinkComponent?: SiteLinkRenderer;
}

export function SiteHeader({
  brand,
  brandHref,
  logo,
  links = [],
  actions,
  navigationLabel = "Main navigation",
  menuLabels = { open: "Open navigation", close: "Close navigation" },
  LinkComponent = "a",
}: SiteHeaderProps) {
  const navigation = (
    <Stack
      component="ul"
      direction={{ xs: "column", md: "row" }}
      spacing={{ xs: 0, md: 2 }}
      useFlexGap
      sx={{ listStyle: "none", p: 0, m: 0, flexWrap: "wrap" }}
    >
      {links.map((link) => (
        <Box
          component="li"
          key={link.href}
          sx={{ minWidth: 0, maxWidth: "100%" }}
        >
          <SiteAnchor
            LinkComponent={LinkComponent}
            href={link.href}
            aria-current={link.active ? "page" : undefined}
            color="text.primary"
            underline="always"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              minWidth: 44,
              maxWidth: "100%",
              width: { xs: "100%", md: "auto" },
              py: 1,
              overflowWrap: "anywhere",
              fontWeight: link.active ? 700 : 400,
            }}
          >
            {link.label}
          </SiteAnchor>
        </Box>
      ))}
    </Stack>
  );
  return (
    <Box
      component="header"
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        py: 1,
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: "grid",
            minHeight: { xs: 48, md: 64 },
            gridTemplateColumns: {
              xs: "minmax(0, 1fr) auto",
              md: "minmax(0, 1fr) minmax(0, 2fr)",
            },
            alignItems: "center",
            gap: 2,
            minWidth: 0,
            "& a:focus-visible, & button:focus-visible": {
              outline: "2px solid",
              outlineColor: "primary.main",
              outlineOffset: 3,
            },
          }}
        >
          <SiteAnchor
            LinkComponent={LinkComponent}
            href={brandHref}
            underline="none"
            color="primary"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 1,
              minWidth: 44,
              minHeight: 44,
              maxWidth: "100%",
              gridColumn: 1,
              gridRow: 1,
              justifySelf: "start",
              overflowWrap: "anywhere",
              fontWeight: 600,
            }}
          >
            {logo != null && (
              <Box
                component="span"
                aria-hidden="true"
                sx={{
                  display: "inline-flex",
                  flexShrink: 0,
                  maxWidth: "25%",
                  "& img, & svg": { maxWidth: "100%", height: "auto" },
                }}
              >
                {logo}
              </Box>
            )}
            <Box
              component="span"
              sx={{ minWidth: 0, overflowWrap: "anywhere" }}
            >
              {brand}
            </Box>
          </SiteAnchor>
          {actions != null && (
            <Box
              sx={{
                display: "flex",
                gridColumn: "1 / -1",
                gridRow: 2,
                flexWrap: "wrap",
                gap: 1,
                minWidth: 0,
                maxWidth: "100%",
                "& a, & button": {
                  minHeight: 44,
                  minWidth: 44,
                  maxWidth: "100%",
                  overflowWrap: "anywhere",
                },
              }}
            >
              {actions}
            </Box>
          )}
          {links.length > 0 && (
            <Box sx={{ gridColumn: "-2 / -1", gridRow: 1, minWidth: 0 }}>
              <HeaderNavigation
                navigationLabel={navigationLabel}
                menuLabels={menuLabels}
              >
                {navigation}
              </HeaderNavigation>
            </Box>
          )}
        </Box>
      </Container>
    </Box>
  );
}
