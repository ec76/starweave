import { Container, Stack, Typography } from "@mui/material";
import { notFound } from "next/navigation";
import { configuredAdmin, safeAdminReturn } from "../../../server/admin/config";
import { AdminUnavailable } from "../admin-views";
import { AuthControls } from "../auth-controls";
import { tokens } from "../../design-tokens";
export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!configuredAdmin()) return <AdminUnavailable />;
  const params = await searchParams;
  let returnTo: string;
  try {
    returnTo = safeAdminReturn(params.returnTo);
  } catch {
    notFound();
  }
  return (
    <Container sx={{ py: tokens.layout.section }}>
      <Stack spacing={3} sx={{ maxWidth: tokens.layout.reading }}>
        <Typography component="h1" variant="h1">
          Sign in
        </Typography>
        <Typography>
          Use the email address and password for your administrator-created
          account.
        </Typography>
        {params.error === "1" && (
          <Typography role="status">
            Sign-in could not be completed. Check your details or reset your
            password.
          </Typography>
        )}
        <AuthControls action="login" returnTo={returnTo} />
      </Stack>
    </Container>
  );
}
