import "server-only";
import { sessionCookiePresent } from "./session-cookie.ts";
import { headers } from "next/headers";
import type { AccountRole } from "../../domain/admin-auth";
import { requireAuthentication, requireRoles } from "../../domain/accounts";
import { configuredAdmin } from "./config";
import { auth } from "./auth";
import { accounts } from "./repository";
import type { AccountRepository } from "./repository";
import { authSessionDiagnostic, authStage } from "./diagnostics.ts";
export async function readProtectedSession(
  request: Request,
  getSession: (headers: Headers) => Promise<{ session: { id: string } } | null>,
  repository: AccountRepository,
) {
  const cookie = request.headers.get("cookie");
  authSessionDiagnostic({
    cookieHeaderPresent: Boolean(cookie),
    sessionCookiePresent: sessionCookiePresent(cookie ?? ""),
  });
  if (!configuredAdmin() || !cookie) return null;
  const result = await authStage("session", "session_lookup", () =>
    getSession(request.headers),
  );
  authSessionDiagnostic({ librarySessionFound: result !== null });
  return result ? repository.session(result.session.id) : null;
}
export async function requestAdminSession(request: Request) {
  return readProtectedSession(
    request,
    (headers) =>
      auth().api.getSession({ headers, query: { disableCookieCache: true } }),
    accounts,
  );
}
export async function currentAdminSession() {
  const requestHeaders = await authStage("session", "page_headers", async () =>
    headers(),
  );
  return requestAdminSession(
    new Request("https://internal.invalid", { headers: requestHeaders }),
  );
}
export async function requireAdminAuthentication() {
  return requireAuthentication(await currentAdminSession());
}
export async function requireAdminRoles(
  allowed: readonly AccountRole[] = ["Writer", "Approver"],
) {
  return requireRoles(await currentAdminSession(), allowed);
}
