import { Container } from "@mui/material";
import { redirect, notFound } from "next/navigation";
import { requireRoles, AdminAccessError } from "../../../domain/accounts";
import { currentAdminSession } from "../../../server/admin/access";
import { activityFilter, listActivity } from "../../../server/admin/activity";
import {
  authDiagnostic,
  withAuthDiagnostics,
} from "../../../server/admin/diagnostics";
import { tokens } from "../../design-tokens";
import { AdminUnavailable, AdminAccessDenied } from "../admin-views";
import { ActivityView } from "./activity-view";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return withAuthDiagnostics(async () => {
    const params = await searchParams;
    let filter;
    try {
      filter = activityFilter(params);
    } catch {
      notFound();
    }
    let session;
    try {
      session = requireRoles(await currentAdminSession(), ["Administrator"]);
    } catch (error) {
      if (error instanceof AdminAccessError) {
        if (error.status === 401)
          redirect("/admin/login?returnTo=/admin/activity");
        return <AdminAccessDenied administrator>{null}</AdminAccessDenied>;
      }
      authDiagnostic("admin_page", "activity_list", "failed", error);
      return <AdminUnavailable />;
    }
    try {
      const result = await listActivity(session.id, filter);
      const href = (page: number) => {
        const query = new URLSearchParams();
        for (const key of ["account", "event", "from", "until"])
          if (typeof params[key] === "string" && params[key])
            query.set(key, params[key]);
        query.set("page", String(page));
        return "/admin/activity?" + query;
      };
      return (
        <Container sx={{ py: tokens.layout.section }}>
          <ActivityView
            events={result.events}
            previous={filter.page > 1 ? href(filter.page - 1) : null}
            next={result.hasMore ? href(filter.page + 1) : null}
          />
        </Container>
      );
    } catch (error) {
      authDiagnostic("admin_page", "activity_list", "failed", error);
      return <AdminUnavailable />;
    }
  });
}
