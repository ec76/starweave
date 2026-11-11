import { request as httpsRequest } from "node:https";
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { disposableAuthDatabase } from "./prepare-auth-verification.js";
import { accountEmail } from "../domain/accounts.ts";
const verificationStages = [
  "target",
  "bootstrap_setup",
  "administrator_password_reset",
  "administrator_password_login",
  "authenticated_session_api",
  "authenticated_admin_page",
  "administrator_creation",
  "setup_password_login",
  "password_recovery_revocation",
  "roles_disablement_and_last_admin",
  "audit_and_logout",
] as const;
class RouteVerificationFailure extends Error {
  constructor(readonly operation: (typeof verificationStages)[number]) {
    super("Owner route assertion failed.");
  }
}
export async function verifyAuthenticatedAdmin(
  request: (path: string) => Promise<{ status: number; text: string }>,
  setStage: (
    stage: "authenticated_session_api" | "authenticated_admin_page",
  ) => void,
) {
  setStage("authenticated_session_api");
  if ((await request("/api/admin/session")).status !== 200)
    throw new RouteVerificationFailure("authenticated_session_api");
  setStage("authenticated_admin_page");
  const page = await request("/admin");
  if (page.status !== 200 || !page.text.includes("Manage accounts"))
    throw new RouteVerificationFailure("authenticated_admin_page");
}
export function authSqlArguments(
  args: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  if (
    args.length < 2 ||
    args.length > 3 ||
    args[0] !== "--database" ||
    (args[2] !== undefined && args[2] !== "--run")
  )
    throw new Error("Use --database ct_explicit_auth_test [--run].");
  const database = disposableAuthDatabase(args[1]!);
  if (
    env.SQL_DATABASE !== database ||
    env.WEBSITE_INSTANCE_ID ||
    env.WEBSITE_SITE_NAME
  )
    throw new Error(
      "Explicit local disposable target must match SQL_DATABASE.",
    );
  return { database, run: args[2] === "--run" };
}
/** Continuing an activated fixture uses ordinary reset eligibility and code checks. */
export async function prepareVerifierAccount(
  post: (
    path: string,
    fields: Record<string, string | string[]>,
  ) => Promise<{ location: string }>,
  readCode: (email: string, purpose: "setup" | "reset") => Promise<string>,
  email: string,
  password: string,
  continuing: boolean,
) {
  const purpose = continuing ? "reset" : "setup";
  await post("/api/auth/" + purpose + "/code", { email });
  const code = await readCode(email, purpose);
  return post("/api/auth/" + purpose, { email, code, password });
}
/** Actual running app routes; no injected SQL adapter or direct library handler.
 * Credentials/cookies/Mailpit codes stay in memory. Fixtures persist for review.
 */
export async function verifyAuthSql(database: string) {
  authSqlArguments(["--database", database, "--run"]);
  const origin = new URL(process.env.ADMIN_AUTH_ORIGIN ?? "");
  if (
    origin.protocol !== "https:" ||
    !["localhost", "127.0.0.1"].includes(origin.hostname) ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  )
    throw new Error("Local HTTPS origin required.");
  const adminEmail = accountEmail(process.env.AUTH_VERIFY_ADMIN_EMAIL);
  const password = randomBytes(32).toString("base64url"),
    nextPassword = randomBytes(32).toString("base64url");
  let stage: (typeof verificationStages)[number] = "target";
  const check = (value: unknown) => {
    if (!value) throw new RouteVerificationFailure(stage);
  };
  const client = () => {
    const jar = new Map<string, string>();
    const request = (path: string, body?: URLSearchParams) =>
      new Promise<{
        status: number;
        location: string;
        text: string;
        json: () => unknown;
      }>((resolve, reject) => {
        const url = new URL(path, origin);
        if (url.origin !== origin.origin) {
          reject(new Error("Verification origin mismatch."));
          return;
        }
        const req = httpsRequest(
          url,
          {
            method: body ? "POST" : "GET",
            rejectUnauthorized:
              process.env.AUTH_VERIFY_ALLOW_SELF_SIGNED !== "1",
            headers: {
              origin: origin.origin,
              cookie: [...jar].map(([k, v]) => k + "=" + v).join("; "),
              ...(body
                ? {
                    "content-type": "application/x-www-form-urlencoded",
                    "content-length": String(
                      Buffer.byteLength(body.toString()),
                    ),
                  }
                : {}),
            },
          },
          (response) => {
            for (const value of response.headers["set-cookie"] ?? []) {
              const pair = value.split(";")[0]!,
                split = pair.indexOf("=");
              jar.set(pair.slice(0, split), pair.slice(split + 1));
            }
            let text = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
              text += chunk;
              if (text.length > 2000000)
                req.destroy(new Error("Verification response exceeded limit."));
            });
            response.on("end", () =>
              resolve({
                status: response.statusCode ?? 0,
                location: response.headers.location ?? "",
                text,
                json: () => JSON.parse(text),
              }),
            );
          },
        );
        req.setTimeout(15000, () => req.destroy());
        req.on("error", () =>
          reject(new Error("Local verification transport failed.")),
        );
        if (body) req.write(body.toString());
        req.end();
      });
    const post = async (
      path: string,
      fields: Record<string, string | string[]>,
    ) => {
      const proof = await request("/api/auth/csrf");
      check(proof.status === 200);
      const token = (proof.json() as { csrfToken: string }).csrfToken;
      const body = new URLSearchParams({ csrfToken: token });
      for (const [key, value] of Object.entries(fields))
        for (const item of Array.isArray(value) ? value : [value])
          body.append(key, item);
      return request(path, body);
    };
    return { request, post };
  };
  const mail = async (email: string, subject: string) => {
    const response = await fetch(
      "http://127.0.0.1:8025/view/latest.txt?query=" +
        encodeURIComponent("to:" + email + ' subject:"' + subject + '"'),
      { redirect: "error", signal: AbortSignal.timeout(5000) },
    );
    check(response.ok);
    return response.text();
  };
  const code = async (email: string, purpose: "setup" | "reset") => {
    const text = await mail(
      email,
      purpose === "setup" ? "Set up your account" : "Reset your password",
    );
    const match = /\b([0-9]{8})\b/.exec(text);
    check(match);
    return match![1]!;
  };
  const admin = client(),
    writer = client();
  const ready = await admin.request(
    "/api/admin/verification?database=" + encodeURIComponent(database),
  );
  check(ready.status === 200 && (ready.json() as { ready: boolean }).ready);
  stage =
    process.env.AUTH_VERIFY_CONTINUE_ACTIVE === "1"
      ? "administrator_password_reset"
      : "bootstrap_setup";
  const entry = await prepareVerifierAccount(
    admin.post,
    code,
    adminEmail,
    password,
    process.env.AUTH_VERIFY_CONTINUE_ACTIVE === "1",
  );
  check(!entry.location.includes("error=1"));
  stage = "administrator_password_login";
  check(
    (await admin.post("/api/auth/login", { email: adminEmail, password }))
      .location ===
      origin.origin + "/admin",
  );
  await verifyAuthenticatedAdmin(admin.request, (substep) => {
    stage = substep;
  });
  if (process.env.AUTH_VERIFY_ADMIN_PAGE_ONLY === "1") {
    console.log(
      "Authenticated session API and admin page verification passed; no account-management fixtures were created.",
    );
    return;
  }
  stage = "administrator_creation";
  const email = "verify-" + randomUUID() + "@example.invalid";
  check(
    (
      await admin.post("/api/admin/accounts", {
        action: "create",
        name: "Disposable password verification",
        email,
        roles: ["Writer", "Approver"],
      })
    ).status === 303,
  );
  const notification = await mail(
    email,
    "Your Called Together account was created",
  );
  check(
    notification.includes(origin.origin + "/admin/setup") &&
      !notification.includes("/admin/setup?"),
  );
  const created = await admin.request(
    "/api/admin/activity?event=account_created",
  );
  check(created.status === 200);
  const targetId = (created.json() as { events: { targetAccountId: string }[] })
    .events[0]?.targetAccountId;
  check(targetId);
  const self = (await admin.request("/api/admin/session")).json() as {
    identity: { subject: string };
  };
  check(
    (
      await admin.post("/api/admin/accounts", {
        action: "create",
        name: "Pending administrator",
        email: "pending-" + randomUUID() + "@example.invalid",
        roles: ["Administrator"],
      })
    ).status === 303,
  );
  check(
    (
      await admin.post("/api/admin/accounts", {
        action: "disable",
        targetId: self.identity.subject,
      })
    ).status === 400,
  );
  stage = "setup_password_login";
  await writer.post("/api/auth/setup/code", { email });
  const setup = await code(email, "setup");
  check(
    !(
      await writer.post("/api/auth/setup", { email, code: setup, password })
    ).location.includes("error=1"),
  );
  check(
    (
      await writer.post("/api/auth/setup", { email, code: setup, password })
    ).location.includes("error=1"),
  );
  check(
    (await writer.post("/api/auth/login", { email, password })).location ===
      origin.origin + "/admin",
  );
  check((await writer.request("/api/admin/session")).status === 200);
  check((await writer.request("/api/admin/session")).status === 200);
  check((await writer.request("/api/admin/activity")).status === 403);
  stage = "password_recovery_revocation";
  const recovery = client();
  await recovery.post("/api/auth/reset/code", { email });
  const reset = await code(email, "reset");
  check(
    !(
      await recovery.post("/api/auth/reset", {
        email,
        code: reset,
        password: nextPassword,
      })
    ).location.includes("error=1"),
  );
  check((await writer.request("/api/admin/session")).status === 401);
  check(
    (
      await recovery.post("/api/auth/reset", { email, code: reset, password })
    ).location.includes("error=1"),
  );
  check(
    (
      await writer.post("/api/auth/login", { email, password })
    ).location.includes("error=1"),
  );
  check(
    (await writer.post("/api/auth/login", { email, password: nextPassword }))
      .location ===
      origin.origin + "/admin",
  );
  stage = "roles_disablement_and_last_admin";
  check(
    (
      await admin.post("/api/admin/accounts", {
        action: "grant_role",
        targetId: targetId!,
        role: "Administrator",
      })
    ).status === 303,
  );
  check((await writer.request("/api/admin/session")).status === 401);
  check(
    (await writer.post("/api/auth/login", { email, password: nextPassword }))
      .status === 303,
  );
  check((await writer.request("/api/admin/session")).status === 200);
  const competing = await Promise.all([
    admin.post("/api/admin/accounts", {
      action: "disable",
      targetId: self.identity.subject,
    }),
    writer.post("/api/admin/accounts", {
      action: "disable",
      targetId: targetId!,
    }),
  ]);
  check(
    competing.filter((result) => result.status === 303).length === 1 &&
      competing.filter((result) => result.status === 400).length === 1,
  );
  const survivor = competing[0]!.status === 400 ? admin : writer;
  const disabledClient = survivor === admin ? writer : admin;
  check((await disabledClient.request("/api/admin/session")).status === 401);
  const survivingId = survivor === admin ? self.identity.subject : targetId!;
  check(
    (
      await survivor.post("/api/admin/accounts", {
        action: "revoke_role",
        targetId: survivingId,
        role: "Administrator",
      })
    ).status === 400,
  );
  const disabledId = survivor === admin ? targetId! : self.identity.subject;
  const survivingEmail = survivor === admin ? adminEmail : email;
  const survivingPassword = survivor === admin ? password : nextPassword;
  check(
    (
      await survivor.post("/api/admin/accounts", {
        action: "enable",
        targetId: disabledId,
      })
    ).status === 303,
  );
  check(
    (
      await survivor.post("/api/admin/accounts", {
        action: "revoke_role",
        targetId: disabledId,
        role: "Administrator",
      })
    ).status === 303,
  );
  check(
    (
      await survivor.post("/api/admin/accounts", {
        action: "grant_role",
        targetId: disabledId,
        role: "Administrator",
      })
    ).status === 303,
  );
  check(
    (
      await survivor.post("/api/admin/accounts", {
        action: "disable",
        targetId: disabledId,
      })
    ).status === 303,
  );
  check((await survivor.post("/api/auth/logout", {})).status === 303);
  check((await survivor.request("/api/admin/session")).status === 401);
  check(
    (
      await survivor.post("/api/auth/login", {
        email: survivingEmail,
        password: survivingPassword,
      })
    ).location ===
      origin.origin + "/admin",
  );
  check((await survivor.request("/api/admin/session")).status === 200);
  stage = "audit_and_logout";
  const activity = (await survivor.request("/api/admin/activity")).json() as {
    events: { eventType: string }[];
  };
  for (const type of [
    "account_created",
    "setup_completed",
    "login",
    "password_reset",
    "sessions_revoked",
    "role_granted",
    "role_revoked",
    "account_enabled",
    "account_bootstrapped",
    "logout",
    "login_failed",
    "reset_failed",
    "code_requested",
    "code_rejected",
    "account_disabled",
  ])
    check(activity.events.some((event) => event.eventType === type));
  check((await survivor.post("/api/auth/logout", {})).status === 303);
  check((await survivor.request("/api/admin/session")).status === 401);
  console.log(
    "Actual application HTTP/SQL/Mailpit verification passed. Disposable fixtures and append-only audit remain for owner review; no production target was allowed.",
  );
}
export async function run(args: readonly string[]) {
  const options = authSqlArguments(args);
  if (!options.run) {
    console.log(
      "Dry-run only. No HTTP, SQL, Mailpit, bootstrap, or migration access. Add --run for the matching disposable running app.",
    );
    return;
  }
  await verifyAuthSql(options.database);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run(process.argv.slice(2)).catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: "verification_failed",
        operation:
          error instanceof RouteVerificationFailure &&
          verificationStages.includes(error.operation)
            ? error.operation
            : "initialization_or_transport",
      }),
    );
    console.error(
      "Owner route verification failed. Inspect sanitized AUTH_DEBUG events; no credentials or raw errors were printed. Fixtures may remain in the disposable target.",
    );
    process.exitCode = 1;
  });
