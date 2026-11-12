import { requireRoles, AdminAccessError } from "../../../../domain/accounts";
import {
  activityFilter,
  listActivity,
} from "../../../../server/admin/activity";
import { requestAdminSession } from "../../../../server/admin/access";
import { adminJson } from "../../../../server/admin/handlers";
import {
  authDiagnostic,
  withAuthDiagnostics,
} from "../../../../server/admin/diagnostics";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withAuthDiagnostics(async () => {
    try {
      const session = requireRoles(await requestAdminSession(request), [
        "Administrator",
      ]);
      const url = new URL(request.url);
      let filter;
      try {
        if (
          [...url.searchParams.keys()].some(
            (key) => url.searchParams.getAll(key).length !== 1,
          )
        )
          throw new Error("Repeated filter.");
        filter = activityFilter(Object.fromEntries(url.searchParams));
      } catch {
        return adminJson({ error: "Invalid activity filter." }, 400);
      }
      return adminJson(await listActivity(session.id, filter));
    } catch (error) {
      if (error instanceof AdminAccessError)
        return adminJson({ error: error.message }, error.status);
      authDiagnostic("admin_page", "activity_list", "failed", error);
      return adminJson({ error: "Activity unavailable." }, 503);
    }
  });
}
