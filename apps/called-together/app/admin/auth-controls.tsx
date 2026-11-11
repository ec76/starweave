"use client";
import { useEffect, useState } from "react";
import { AuthActionForm, AccountManagement } from "./admin-views";
import type { AccountSummary } from "../../domain/accounts";
function useCsrf() {
  const [csrfToken, setToken] = useState(""),
    [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/csrf", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data: unknown = await response.json();
        if (
          !data ||
          typeof data !== "object" ||
          !("csrfToken" in data) ||
          typeof data.csrfToken !== "string" ||
          !/^[A-Za-z0-9_-]{43}$/.test(data.csrfToken)
        )
          throw new Error();
        setToken(data.csrfToken);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);
  return { csrfToken, error, pending: !csrfToken && !error };
}
export function AuthControls({
  action,
  returnTo,
}: {
  action: "login" | "logout" | "setup" | "reset";
  returnTo?: string;
}) {
  return <AuthActionForm action={action} returnTo={returnTo} {...useCsrf()} />;
}
export function AccountControls({
  accounts,
}: {
  accounts: readonly AccountSummary[];
}) {
  const csrf = useCsrf();
  return (
    <>
      <AuthActionForm action="logout" {...csrf} />
      <AccountManagement accounts={accounts} csrfToken={csrf.csrfToken} />
    </>
  );
}
