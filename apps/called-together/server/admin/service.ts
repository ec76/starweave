import "server-only";
import { createHmac } from "node:crypto";
import type { AdminSession } from "../../domain/admin-auth";
import {
  accountEmail,
  accountName,
  accountId,
  accountRoles,
  requireRoles,
} from "../../domain/accounts";
import type { AccountRepository, AccountOperation } from "./repository";

export function accountService(repository: AccountRepository) {
  return {
    async mayAttempt(
      action: string,
      email: string | undefined,
      secret: string,
    ) {
      const global = await repository.throttle(
        action + ":global",
        action.endsWith("-code") ? 20 : 60,
      );
      if (!global || !email) return false;
      return repository.throttle(
        action + ":" + createHmac("sha256", secret).update(email).digest("hex"),
        action.endsWith("-code") ? 3 : 5,
      );
    },
    async manage(session: AdminSession | null, fields: FormData) {
      const actor = requireRoles(session, ["Administrator"]);
      const action = fields.get("action");
      if (
        ![
          "create",
          "grant_role",
          "revoke_role",
          "disable",
          "enable",
          "revoke_sessions",
        ].includes(String(action))
      )
        throw new Error("Invalid operation.");
      let operation: AccountOperation;
      if (action === "create") {
        const roles = accountRoles.filter((role) =>
          fields.getAll("roles").includes(role),
        );
        if (
          !roles.length ||
          fields
            .getAll("roles")
            .some(
              (role) =>
                typeof role !== "string" ||
                !accountRoles.includes(role as (typeof accountRoles)[number]),
            )
        )
          throw new Error("Assign at least one role.");
        operation = {
          roles,
          action,
          email: accountEmail(fields.get("email")),
          name: accountName(fields.get("name")),
        };
      } else {
        const role = fields.get("role");
        if (
          (action === "grant_role" || action === "revoke_role") &&
          !accountRoles.includes(role as (typeof accountRoles)[number])
        )
          throw new Error("Invalid role.");
        operation = {
          action: action as AccountOperation["action"],
          targetId: accountId(fields.get("targetId")),
          role: typeof role === "string" ? role : undefined,
        };
      }
      // SQL reauthorizes this exact live session under the administration lock.
      await repository.manage(actor.id, operation);
    },
  };
}
