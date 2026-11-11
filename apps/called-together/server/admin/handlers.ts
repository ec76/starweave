import "server-only";
import { NextResponse } from "next/server";
import { adminConfig, safeAdminReturn, type AdminConfig } from "./config";
import {
  adminCookies,
  flowSeconds,
  freshToken,
  seal,
  open,
  equalToken,
  cookieValue,
} from "./session";
import { accountEmail, requireRoles } from "../../domain/accounts";
import { credentialOperation, type CredentialAction } from "./credentials.ts";
import { securityEvent } from "./activity.ts";
import { accounts } from "./repository";
import { accountService } from "./service";
import { requestAdminSession } from "./access";
import { deliverAccountNotifications } from "./notifications.ts";
import { authDiagnostic, authStage, withAuthDiagnostics } from "./diagnostics";

export const adminHeaders = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
};
export function adminJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: adminHeaders });
}
export function redirect(url: URL | string) {
  return NextResponse.redirect(url, { status: 303, headers: adminHeaders });
}
export async function csrfForm(
  request: Request,
  config: AdminConfig,
): Promise<FormData | null> {
  if (
    request.method !== "POST" ||
    request.headers.get("origin") !== config.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return null;
  const type = request.headers.get("content-type")?.split(";")[0];
  if (
    type !== "application/x-www-form-urlencoded" &&
    type !== "multipart/form-data"
  )
    return null;
  const token = await open(
    config,
    cookieValue(request.headers.get("cookie"), adminCookies.csrf),
  );
  if (!token) return null;
  try {
    // Bound chunked bodies too; Content-Length alone is client-controlled.
    const reader = request.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return null;
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const form = await new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: bytes.buffer,
    }).formData();
    if (
      [...new Set(form.keys())].some((key) =>
        key === "roles"
          ? form.getAll(key).length > 3
          : form.getAll(key).length !== 1,
      )
    )
      return null;
    return equalToken(form.get("csrfToken"), token.csrfToken) ? form : null;
  } catch {
    return null;
  }
}
export async function csrfGet() {
  try {
    const config = adminConfig(),
      csrfToken = freshToken();
    const response = adminJson({ csrfToken });
    response.cookies.set(adminCookies.csrf, await seal(config, csrfToken), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: flowSeconds,
    });
    return response;
  } catch {
    return adminJson({ error: "Admin authentication is unavailable." }, 503);
  }
}
export type CredentialRunner = typeof credentialOperation;
export function credentialHandler(
  action: CredentialAction,
  run: CredentialRunner = credentialOperation,
  repository = accounts,
) {
  return (request: Request) =>
    withAuthDiagnostics(async () => {
      try {
        const config = adminConfig(),
          form = await csrfForm(request, config);
        if (!form) return adminJson({ error: "Invalid account request." }, 403);
        const send = action.endsWith("-code");
        const returnTo =
          action === "login"
            ? safeAdminReturn(form.get("returnTo"))
            : "/admin/login";
        const purpose = action.startsWith("setup-") ? "setup" : "reset";
        let result: Response | undefined;
        try {
          let email: string | undefined;
          if (action !== "logout") {
            try {
              email = accountEmail(form.get("email"));
            } catch {
              /* Generic failure, still consume the global limit. */
            }
          }
          const permitted =
            action === "logout" ||
            (await accountService(repository).mayAttempt(
              action,
              email,
              config.secret,
            ));
          const password = form.get("password"),
            code = form.get("code");
          if (
            (action === "login" || action.endsWith("-finish")) &&
            (typeof password !== "string" ||
              password.length < 12 ||
              password.length > 128)
          )
            throw new Error("Invalid input.");
          if (
            action.endsWith("-finish") &&
            (typeof code !== "string" || !/^[0-9]{8}$/.test(code))
          )
            throw new Error("Invalid input.");
          if (permitted)
            result = await run(
              action,
              {
                email,
                password: typeof password === "string" ? password : undefined,
                code: typeof code === "string" ? code : undefined,
              },
              request,
            );
        } catch (error) {
          authDiagnostic("login", "credential_action", "failed", error);
        }
        const successful = result?.ok === true;
        const security = send
          ? "code_requested"
          : successful || action === "logout"
            ? null
            : action === "login"
              ? "login_failed"
              : action === "setup-finish"
                ? "code_rejected"
                : "reset_failed";
        if (security) await securityEvent(security); // separate committed boundary, no address
        if (send)
          return redirect(
            new URL("/admin/" + purpose + "?sent=1", config.origin),
          );
        if (!successful)
          return redirect(
            new URL(
              "/admin/" +
                (action === "login" || action === "logout"
                  ? "login"
                  : purpose) +
                "?error=1",
              config.origin,
            ),
          );
        const destination = returnTo;
        const response = redirect(new URL(destination, config.origin));
        if (action === "login" || action === "logout")
          for (const cookie of result!.headers.getSetCookie())
            response.headers.append("set-cookie", cookie);
        return response;
      } catch (error) {
        authDiagnostic("login", "credential_action", "failed", error);
        return adminJson(
          { error: "Admin authentication is unavailable." },
          503,
        );
      }
    });
}
export const loginPost = credentialHandler("login");
export const logoutPost = credentialHandler("logout");
export const setupCodePost = credentialHandler("setup-code");
export const setupFinishPost = credentialHandler("setup-finish");
export const resetCodePost = credentialHandler("reset-code");
export const resetFinishPost = credentialHandler("reset-finish");
export async function managePost(request: Request) {
  return withAuthDiagnostics(async () => {
    try {
      const config = adminConfig(),
        form = await csrfForm(request, config);
      if (!form) return adminJson({ error: "Invalid account request." }, 403);
      const session = requireRoles(await requestAdminSession(request), [
        "Administrator",
      ]);
      await authStage("query", "account_management", () =>
        accountService(accounts).manage(session, form),
      );
      if (form.get("action") === "create") {
        try {
          await deliverAccountNotifications(
            undefined,
            accountEmail(form.get("email")),
          );
        } catch (error) {
          authDiagnostic(
            "mailpit_delivery",
            "account_notification",
            "failed",
            error,
          );
        }
      }
      return redirect(new URL("/admin?updated=1", config.origin));
    } catch (error) {
      const status =
        error && typeof error === "object" && "status" in error
          ? error.status
          : 400;
      return adminJson(
        {
          error:
            "Account operation could not be completed. An administrator must remain active.",
        },
        typeof status === "number" ? status : 400,
      );
    }
  });
}
