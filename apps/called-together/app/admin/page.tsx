import { redirect } from "next/navigation";
import { Link } from "@mui/material";
import { adminConfig } from "../../server/admin/config";
import { currentAdminSession } from "../../server/admin/access";
import { accounts } from "../../server/admin/repository";
import {
  AdminLanding,
  AdminAccessDenied,
  AdminUnavailable,
} from "./admin-views";
import { AuthControls, AccountControls } from "./auth-controls";
import {
  authDiagnostic,
  authStage,
  authStageSync,
  withAuthDiagnostics,
} from "../../server/admin/diagnostics";
export default async function AdminPage() {
  return withAuthDiagnostics(async () => {
    let session, summaries;
    try {
      authStageSync("configuration", "admin_configuration", () =>
        adminConfig(),
      );
      session = await authStage("session", "page_session", () =>
        currentAdminSession(),
      );
      if (session?.roles.includes("Administrator"))
        summaries = await accounts.list();
    } catch (error) {
      authDiagnostic("admin_page", "admin_page", "failed", error);
      return <AdminUnavailable />;
    }
    if (!session) redirect("/admin/login?returnTo=/admin");
    if (session.roles.length === 0)
      return (
        <AdminAccessDenied>
          <AuthControls action="logout" />
        </AdminAccessDenied>
      );
    return (
      <AdminLanding session={session}>
        {summaries ? (
          <>
            <Link href="/admin/activity">View activity</Link>
            <AccountControls accounts={summaries} />
          </>
        ) : (
          <AuthControls action="logout" />
        )}
      </AdminLanding>
    );
  });
}
