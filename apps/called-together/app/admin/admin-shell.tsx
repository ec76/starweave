"use client";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  Box,
  Breadcrumbs,
  Drawer,
  Link,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { AccountRole } from "../../domain/admin-auth";

export type AdminSection = "dashboard" | "accounts" | "activity" | "profiles";
export function AdminShell({
  section,
  roles,
  children,
  actions,
  accountName,
}: {
  section: AdminSection;
  roles: readonly AccountRole[];
  children: ReactNode;
  actions?: ReactNode;
  accountName?: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const context =
    section === "dashboard"
      ? "Dashboard"
      : section === "accounts"
        ? "Accounts"
        : section === "profiles"
          ? "Author profiles"
          : "Activity";
  const links = [
    { section: "dashboard", label: "Dashboard", href: "/admin" },
    ...(roles.includes("Writer")
      ? [
          {
            section: "profiles",
            label: "Author profiles",
            href: "/admin/profiles",
          },
        ]
      : []),
    ...(roles.includes("Administrator")
      ? [
          { section: "accounts", label: "Accounts", href: "/admin/accounts" },
          { section: "activity", label: "Activity", href: "/admin/activity" },
        ]
      : []),
  ];
  const navigation = (
    <Stack spacing={1}>
      {links.map((link) => (
        <Button
          key={link.href}
          href={link.href}
          onClick={() => setMobileOpen(false)}
          aria-current={section === link.section ? "page" : undefined}
          variant={section === link.section ? "contained" : "text"}
          sx={{ minHeight: 44, justifyContent: "flex-start" }}
        >
          {link.label}
        </Button>
      ))}
    </Stack>
  );
  return (
    <Container sx={{ py: { xs: 2, md: 3 } }}>
      <Stack
        direction="row"
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 2,
          pb: 2,
          mb: 3,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
          <Button
            onClick={() => setMobileOpen(true)}
            aria-expanded={mobileOpen}
            aria-controls={mobileOpen ? "admin-mobile-navigation" : undefined}
            sx={{ display: { xs: "inline-flex", md: "none" }, minHeight: 44 }}
          >
            Menu
          </Button>
          <Breadcrumbs aria-label="Page context" separator="/">
            <Link href="/" underline="hover">
              Called Together
            </Link>
            <Typography aria-current="page" sx={{ fontWeight: 600 }}>
              {context}
            </Typography>
          </Breadcrumbs>
        </Stack>
        <Stack
          direction="row"
          sx={{ alignItems: "center", gap: 2, minWidth: 0, flexWrap: "wrap" }}
        >
          {accountName && (
            <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
              {accountName}
            </Typography>
          )}
          {actions}
        </Stack>
      </Stack>
      <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)}>
        <Box
          id="admin-mobile-navigation"
          component="nav"
          aria-label="Mobile administration"
          sx={{ width: "min(280px, 85vw)", p: 2 }}
        >
          <Typography sx={{ mb: 2, fontWeight: 600 }}>
            Administration
          </Typography>
          <Button onClick={() => setMobileOpen(false)} sx={{ mb: 2 }}>
            Close menu
          </Button>
          {navigation}
        </Box>
      </Drawer>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "minmax(0,1fr)",
            md: "200px minmax(0,1fr)",
          },
          gap: { xs: 3, md: 4 },
        }}
      >
        <Box
          component="nav"
          aria-label="Administration"
          sx={{ display: { xs: "none", md: "block" } }}
        >
          {navigation}
        </Box>
        <Box sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
          <Breadcrumbs aria-label="Breadcrumb" separator="/" sx={{ mb: 3 }}>
            {section !== "dashboard" && <Link href="/admin">Dashboard</Link>}
            <Typography aria-current="page">{context}</Typography>
          </Breadcrumbs>
          {children}
        </Box>
      </Box>
    </Container>
  );
}

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <Stack spacing={2} sx={{ mb: 4 }}>
      <Typography component="h1" variant="h1">
        {title}
      </Typography>
      {description && (
        <Typography color="text.secondary">{description}</Typography>
      )}
      {actions}
    </Stack>
  );
}
export function AdminPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      component="section"
      sx={{ p: { xs: 2, sm: 3 }, borderRadius: "12px", minWidth: 0 }}
    >
      <Typography component="h2" variant="h3" sx={{ mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}
