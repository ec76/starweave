import "server-only";
import type { AdminSession } from "../../domain/admin-auth";
import { requireRoles, AdminAccessError } from "../../domain/accounts";
import { adminJson } from "./handlers";
import { requestAdminSession } from "./access";
export function sessionApi(
  readSession: (
    request: Request,
  ) => Promise<AdminSession | null> = requestAdminSession,
) {
  return async (request: Request) => {
    try {
      const session = requireRoles(await readSession(request), [
        "Writer",
        "Approver",
        "Administrator",
      ]);
      return adminJson({ identity: session.identity, roles: session.roles });
    } catch (error) {
      if (error instanceof AdminAccessError)
        return adminJson({ error: error.message }, error.status);
      return adminJson({ error: "Admin authentication is unavailable." }, 503);
    }
  };
}
