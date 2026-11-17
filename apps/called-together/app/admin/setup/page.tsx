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
            If your account is eligible and email is available, a code will
            arrive. It expires in five minutes. If no code arrives, contact an
            administrator.
          </Typography>
        )}
        {params.error === "1" && (
          <Typography role="status">
            Setup could not be completed. Check your email address, password,
            and code. Codes expire after five minutes and can only be used once.
            Request a new code, or contact an administrator if your invitation
            has expired.
          </Typography>
        )}
        <AuthControls action="setup" />
        <Link href="/admin/login">Return to sign in</Link>
      </Stack>
    </Container>
  );
}
