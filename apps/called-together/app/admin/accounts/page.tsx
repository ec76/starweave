import { Button } from "@mui/material";
import { notFound, redirect } from "next/navigation";
import { AdminAccessError, requireRoles } from "../../../domain/accounts";
import {
  accountFilter,
  accountSearchHref,
} from "../../../domain/account-search";
import { currentAdminSession } from "../../../server/admin/access";
import { searchAccounts } from "../../../server/admin/account-search";
import {
  authDiagnostic,
  withAuthDiagnostics,
} from "../../../server/admin/diagnostics";
import { AdminAccessDenied, AdminUnavailable } from "../admin-views";
import { AdminShell, AdminPageHeader } from "../admin-shell";
import { AccountControls, AuthControls } from "../auth-controls";
import { AccountsView, AccountSearchError } from "./accounts-view";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return withAuthDiagnostics(async () => {
    let session;
    try {
      session = requireRoles(await currentAdminSession(), ["Administrator"]);
    } catch (error) {
      if (error instanceof AdminAccessError) {
        if (error.status === 401)
          redirect("/admin/login?returnTo=/admin/accounts");
        return (
          <AdminAccessDenied administrator>
            <AuthControls action="logout" />
          </AdminAccessDenied>
        );
      }
      authDiagnostic("admin_page", "admin_account_list", "failed", error);
      return <AdminUnavailable />;
    }
    const params = await searchParams;
    let filter;
    try {
      filter = accountFilter(params);
    } catch {
      notFound();
    }
    try {
      const result = await searchAccounts(session, filter);
      return (
        <AdminShell
          accountName={session.identity.displayName}
          section="accounts"
          roles={session.roles}
          actions={<AuthControls action="logout" />}
        >
          <AdminPageHeader
            actions={
              <Button href="/admin/accounts#create-account" variant="contained">
                Create account
              </Button>
            }
            title="Accounts"
            description="Find an account and manage its access. Author profiles are separate from security accounts."
          />
          <AccountsView
            filter={filter}
            count={result.accounts.length}
            updated={params.updated === "1"}
            previous={
              filter.page > 1
                ? accountSearchHref(filter, filter.page - 1)
                : null
            }
            next={
              result.hasMore ? accountSearchHref(filter, filter.page + 1) : null
            }
          >
            <AccountControls
              accounts={result.accounts}
              listDescription="Only this search page is shown. Existing account controls remain available here while dedicated detail and creation pages are developed."
            />
          </AccountsView>
        </AdminShell>
      );
    } catch (error) {
      authDiagnostic("admin_page", "admin_account_list", "failed", error);
      return (
        <AdminShell
          section="accounts"
          roles={session.roles}
          actions={<AuthControls action="logout" />}
        >
          <AdminPageHeader title="Accounts" />
          <AccountSearchError />
        </AdminShell>
      );
    }
  });
}
