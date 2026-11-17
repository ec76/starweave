import type { ReactNode } from "react";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import { accountRoles } from "../../../domain/accounts";
import type { AccountFilter } from "../../../domain/account-search";
import { AdminPanel } from "../admin-shell";
export function AccountSearchError() {
  return (
    <Alert severity="error" role="alert">
      Account search is temporarily unavailable.{" "}
      <Button href="/admin/accounts">Try account search again</Button>
    </Alert>
  );
}
export function AccountsView({
  filter,
  count,
  previous,
  next,
  updated,
  children,
}: {
  filter: AccountFilter;
  count: number;
  previous: string | null;
  next: string | null;
  updated?: boolean;
  children: ReactNode;
}) {
  return (
    <Stack spacing={3}>
      {updated && (
        <Alert severity="success" role="status">
          Account operation completed. For a new account, email delivery must be
          checked separately.
        </Alert>
      )}
      <AdminPanel title="Find an account">
        <Stack
          component="form"
          action="/admin/accounts"
          method="get"
          spacing={2}
        >
          <TextField
            name="q"
            label="Name or email"
            defaultValue={filter.q}
            slotProps={{ htmlInput: { maxLength: 254 } }}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              name="status"
              select
              label="Status"
              defaultValue={filter.status}
              slotProps={{
                select: { native: true },
                inputLabel: { shrink: true },
              }}
              sx={{ flex: 1 }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending setup</option>
              <option value="disabled">Disabled</option>
            </TextField>
            <TextField
              name="role"
              select
              label="Role"
              defaultValue={filter.role}
              slotProps={{
                select: { native: true },
                inputLabel: { shrink: true },
              }}
              sx={{ flex: 1 }}
            >
              <option value="">All roles</option>
              {accountRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={2}>
            <Button type="submit" variant="contained">
              Search accounts
            </Button>
            <Button href="/admin/accounts">Clear filters</Button>
          </Stack>
        </Stack>
      </AdminPanel>
      <Typography role="status">
        Page {filter.page} · {count} {count === 1 ? "account" : "accounts"}{" "}
        shown
      </Typography>
      {count === 0 && (
        <Alert severity="info">
          No matching accounts on this page. Change the filters or return to an
          earlier page.
        </Alert>
      )}
      {children}
      <Stack
        component="nav"
        aria-label="Account search pages"
        direction="row"
        spacing={2}
      >
        {previous && <Button href={previous}>Previous page</Button>}
        {next && <Button href={next}>Next page</Button>}
      </Stack>
    </Stack>
  );
}
