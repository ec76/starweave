import { AdminShell, AdminPageHeader } from "./admin-shell";
import { DashboardView, type DashboardSummary } from "./dashboard-view";
import {
  Box,
  Button,
  Container,
  Stack,
  Typography,
  TextField,
  Checkbox,
  FormControlLabel,
  Link,
} from "@mui/material";
import type { AdminSession } from "../../domain/admin-auth";
import type { AccountSummary } from "../../domain/accounts";
import { tokens } from "../design-tokens";
export function AdminUnavailable() {
  return (
    <Container sx={{ py: tokens.layout.section }}>
      <Stack spacing={3}>
        <Typography component="h1" variant="h1">
          Admin sign-in is temporarily unavailable.
        </Typography>
        <Typography>
          Please try again later. Public articles are still available.
        </Typography>
      </Stack>
    </Container>
  );
}
export function AuthActionForm({
  action,
  csrfToken,
  returnTo = "/admin",
  pending = false,
  error = false,
}: {
  action: "login" | "logout" | "setup" | "reset";
  csrfToken: string;
  returnTo?: string;
  pending?: boolean;
  error?: boolean;
}) {
  return (
    <Box component="form" method="post" action={"/api/auth/" + action}>
      <input type="hidden" name="csrfToken" value={csrfToken} />
      {action !== "logout" && (
        <Stack spacing={2} sx={{ mb: 2, maxWidth: "32rem" }}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <TextField
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
            required
            slotProps={{ htmlInput: { maxLength: 254 } }}
          />
          {(action === "setup" || action === "reset") && (
            <>
              <TextField
                label="Verification code"
                name="code"
                autoComplete="one-time-code"
                required
                slotProps={{
                  htmlInput: {
                    inputMode: "numeric",
                    pattern: "[0-9]{8}",
                    maxLength: 8,
                  },
                }}
              />
              <Button
                type="submit"
                formAction={"/api/auth/" + action + "/code"}
                formNoValidate
                variant="outlined"
                disabled={pending || !csrfToken}
              >
                Request a {action} code
              </Button>
            </>
          )}
          <TextField
            label={action === "login" ? "Password" : "New password"}
            name="password"
            type="password"
            required
            autoComplete={
              action === "login" ? "current-password" : "new-password"
            }
            helperText="Use 12 to 128 characters."
            slotProps={{ htmlInput: { minLength: 12, maxLength: 128 } }}
          />
        </Stack>
      )}
      <Button
        type="submit"
        variant="contained"
        disabled={pending || !csrfToken}
      >
        {action === "login"
          ? "Sign in"
          : action === "logout"
            ? "Sign out"
            : action === "setup"
              ? "Verify code and set password"
              : "Verify code and reset password"}
      </Button>
      {action === "login" && (
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Link href="/admin/setup">Set up your account</Link>
          <Link href="/admin/reset">Forgot password?</Link>
        </Stack>
      )}
      {pending && (
        <Typography role="status" sx={{ mt: 2 }}>
          Preparing secure sign-in controls...
        </Typography>
      )}
      {error && (
        <Typography role="status" sx={{ mt: 2 }}>
          Sign-in controls are unavailable. Refresh this page to try again.
        </Typography>
      )}
    </Box>
  );
}
export function AdminLanding({
  session,
  children,
  summary,
}: {
  session: AdminSession;
  children: React.ReactNode;
  summary?: DashboardSummary;
}) {
  return (
    <AdminShell section="dashboard" roles={session.roles} actions={children}>
      <AdminPageHeader
        title="Dashboard"
        description={"Welcome, " + session.identity.displayName}
      />
      <Typography sx={{ mb: 3 }}>
        Your roles: {session.roles.join(", ")}. Administrator access does not
        grant Writer or Approver permissions.
      </Typography>
      <DashboardView
        administrator={session.roles.includes("Administrator")}
        summary={summary}
      />
    </AdminShell>
  );
}
export function AdminAccessDenied({
  children,
  administrator = false,
}: {
  children: React.ReactNode;
  administrator?: boolean;
}) {
  return (
    <Container sx={{ py: tokens.layout.section }}>
      <Stack spacing={3}>
        <Typography component="h1" variant="h1">
          Account access required
        </Typography>
        <Typography>
          {administrator
            ? "This view requires an Administrator role."
            : "Your account has no assigned roles. Contact an administrator if you need access."}
        </Typography>
        {children}
      </Stack>
    </Container>
  );
}
export function AccountManagement({
  accounts,
  csrfToken,
  listDescription = "Up to 100 most recently created accounts are shown.",
}: {
  accounts: readonly AccountSummary[];
  csrfToken: string;
  listDescription?: string;
}) {
  return (
    <Stack spacing={3} sx={{ mt: 4 }}>
      <Typography component="h2" variant="h3">
        Manage accounts
      </Typography>
      <Box
        component="details"
        id="create-account"
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: "12px",
          p: { xs: 2, sm: 3 },
        }}
      >
        <Typography
          component="summary"
          sx={{ cursor: "pointer", minHeight: 44 }}
        >
          Create account
        </Typography>
        <Typography>
          Create an account with at least one role. A notification links to
          setup; the user requests a code and sets their own password. Role
          changes revoke existing sessions. Pending accounts do not count as
          active administrators.
        </Typography>
        <Stack
          component="form"
          action="/api/admin/accounts"
          method="post"
          spacing={2}
        >
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="action" value="create" />
          <TextField
            name="name"
            label="Display name"
            required
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <TextField
            name="email"
            label="Email address"
            type="email"
            required
            slotProps={{ htmlInput: { maxLength: 254 } }}
          />
          <Box component="fieldset">
            <Typography component="legend">Assign roles</Typography>
            {["Writer", "Approver", "Administrator"].map((role) => (
              <FormControlLabel
                key={role}
                control={<Checkbox name="roles" value={role} />}
                label={role}
              />
            ))}
          </Box>
          <Button type="submit" variant="contained" disabled={!csrfToken}>
            Create account
          </Button>
        </Stack>
      </Box>
      <Typography>{listDescription}</Typography>
      <Box
        component="ul"
        aria-label="Matching accounts"
        sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 3 }}
      >
        {accounts.map((account) => (
          <Stack
            component="li"
            key={account.id}
            spacing={2}
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: "12px",
              p: { xs: 2, sm: 3 },
              bgcolor: "background.paper",
              minWidth: 0,
            }}
          >
            <Typography component="h3" variant="h3">
              {account.name}
            </Typography>
            <Typography sx={{ overflowWrap: "anywhere" }}>
              {account.email}
            </Typography>
            <Typography>
              Status:{" "}
              {account.disabled
                ? "Disabled"
                : account.activatedAt
                  ? "Active"
                  : "Pending setup"}
            </Typography>
            <Typography>
              Roles: {account.roles.join(", ") || "No roles"}
            </Typography>
            <Stack
              component="form"
              action="/api/admin/accounts"
              method="post"
              spacing={2}
            >
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <input type="hidden" name="targetId" value={account.id} />
              <TextField
                select
                name="role"
                label="Role"
                defaultValue="Writer"
                slotProps={{ select: { native: true } }}
              >
                <option value="Writer">Writer</option>
                <option value="Approver">Approver</option>
                <option value="Administrator">Administrator</option>
              </TextField>
              <Stack
                direction="row"
                useFlexGap
                sx={{ flexWrap: "wrap", gap: 2 }}
              >
                <Button
                  type="submit"
                  name="action"
                  value="grant_role"
                  disabled={!csrfToken}
                >
                  Assign role
                </Button>
                <Button
                  type="submit"
                  name="action"
                  value="revoke_role"
                  disabled={!csrfToken}
                >
                  Revoke role
                </Button>
                <Button
                  type="submit"
                  name="action"
                  value="revoke_sessions"
                  disabled={!csrfToken}
                >
                  Revoke sessions
                </Button>
                <Button
                  type="submit"
                  name="action"
                  value="enable"
                  disabled={!csrfToken}
                >
                  Enable account
                </Button>
                <Button
                  type="submit"
                  name="action"
                  value="disable"
                  disabled={!csrfToken}
                >
                  Disable account
                </Button>
              </Stack>
            </Stack>
          </Stack>
        ))}
      </Box>
    </Stack>
  );
}
