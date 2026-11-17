import { redirect } from "next/navigation";
import { adminConfig } from "../../server/admin/config";
import { currentAdminSession } from "../../server/admin/access";
import { accountCounts } from "../../server/admin/account-search";
import { listActivity } from "../../server/admin/activity";
import type { DashboardSummary } from "./dashboard-view";
import {
  AdminLanding,
  AdminAccessDenied,
  AdminUnavailable,
} from "./admin-views";
import { AuthControls } from "./auth-controls";
import {
  authDiagnostic,
  authStage,
  authStageSync,
  withAuthDiagnostics,
} from "../../server/admin/diagnostics";
export default async function AdminPage() {
  return withAuthDiagnostics(async () => {
    let session;
    const summary: DashboardSummary = { counts: null, events: null };
    try {
      authStageSync("configuration", "admin_configuration", () =>
        adminConfig(),
      );
      session = await authStage("session", "page_session", () =>
        currentAdminSession(),
      );
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
    if (session.roles.includes("Administrator")) {
      try {
        summary.counts = await accountCounts(session);
      } catch (error) {
        authDiagnostic("admin_page", "admin_account_list", "failed", error);
      }
      try {
        summary.events = (
          await listActivity(session.id, { page: 1 })
        ).events.slice(0, 3);
      } catch (error) {
        authDiagnostic("admin_page", "activity_list", "failed", error);
      }
    }
    return (
      <AdminLanding session={session} summary={summary}>
        <AuthControls action="logout" />
      </AdminLanding>
    );
  });
}
