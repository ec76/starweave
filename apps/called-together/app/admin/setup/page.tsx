import { Container, Stack, Typography, Link } from "@mui/material";
import { configuredAdmin } from "../../../server/admin/config";
import { AdminUnavailable } from "../admin-views";
import { AuthControls } from "../auth-controls";
import { tokens } from "../../design-tokens";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!configuredAdmin()) return <AdminUnavailable />;
  const params = await searchParams;
  return (
    <Container sx={{ py: tokens.layout.section }}>
      <Stack spacing={3} sx={{ maxWidth: tokens.layout.reading }}>
        <Typography component="h1" variant="h1">
          Set up your account
        </Typography>
        <Typography>
          Accounts are created by an administrator. Request a setup code, then
          verify it while choosing your password.
        </Typography>
        {params.sent === "1" && (
          <Typography role="status">
            If this account is eligible, a code has been sent. Check your email.
          </Typography>
        )}
        {params.error === "1" && (
          <Typography role="status">
            The request could not be completed. Check your details or request a
            new code.
          </Typography>
        )}
        <AuthControls action="setup" />
        <Link href="/admin/login">Return to sign in</Link>
      </Stack>
    </Container>
  );
}
