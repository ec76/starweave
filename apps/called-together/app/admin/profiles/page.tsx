import { redirect } from "next/navigation";
import { Alert, Link, Stack } from "@mui/material";
import { currentAdminSession } from "../../../server/admin/access";
import { profiles } from "../../../server/profiles/repository";
import { profileService } from "../../../server/profiles/service";
import { AdminShell } from "../admin-shell";
import { AuthControls } from "../auth-controls";
import { ProfileEditor } from "./profile-editor";

export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string | string[] }>;
}) {
  const session = await currentAdminSession();
  if (!session) redirect("/admin/login?returnTo=/admin/profiles");
  let content;
  try {
    const params = await searchParams;
    if (Array.isArray(params.profile)) throw new Error();
    const service = profileService(profiles);
    const profile = await service.read(session, params.profile ?? null);
    const choices = await service.list(session);
    content = (
      <Stack spacing={3}>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 2 }}>
          <Link href="/admin/profiles">My profile</Link>
          {choices.map((choice) => (
            <Link key={choice.id} href={`/admin/profiles?profile=${choice.id}`}>
              {choice.displayName}
            </Link>
          ))}
        </Stack>
        <ProfileEditor
          key={`${profile?.id ?? "new"}:${profile?.latestRevisionId ?? "none"}`}
          profile={profile}
        />
      </Stack>
    );
  } catch {
    content = (
      <Alert severity="error">
        Profile unavailable. Writer access and profile ownership are required.{" "}
        <Link href="/admin/profiles">Try my profile again</Link>
      </Alert>
    );
  }
  return (
    <AdminShell
      section="profiles"
      roles={session.roles}
      accountName={session.identity.displayName}
      actions={<AuthControls action="logout" />}
    >
      {content}
    </AdminShell>
  );
}
