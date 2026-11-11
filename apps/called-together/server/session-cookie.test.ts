import { describe, expect, it } from "vitest";
import { getCookies } from "better-auth/cookies";
import {
  sessionCookieName,
  sessionCookieOptions,
  sessionCookiePresent,
} from "./admin/session-cookie.ts";

describe("installed Better Auth session cookie naming", () => {
  it("detects the effective secure custom name without accepting lookalikes", () => {
    const actual = getCookies({ advanced: sessionCookieOptions }).sessionToken
      .name;
    expect(actual).toBe("__Secure-__Host-ct-session");
    expect(sessionCookieName).toBe(actual);
    expect(sessionCookiePresent(`other=x; ${actual}=private`)).toBe(true);
    expect(sessionCookiePresent("__Host-ct-session=private")).toBe(false);
    expect(sessionCookiePresent(`${actual}.evil=private`)).toBe(false);
    expect(sessionCookiePresent(`other=${actual}=private`)).toBe(false);
  });
});
