import { getCookies } from "better-auth/cookies";

// Share the options with Better Auth: its secure prefix is prepended even to
// this custom name. Do not guess the effective name from the custom name alone.
export const sessionCookieOptions = {
  useSecureCookies: true,
  cookies: {
    session_token: {
      name: "__Host-ct-session",
      attributes: {
        secure: true,
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
      },
    },
  },
};
export const sessionCookieName = getCookies({
  advanced: sessionCookieOptions,
}).sessionToken.name;
export function sessionCookiePresent(cookie: string) {
  return cookie.split(";").some((part) => {
    const name = part.trim().split("=", 1)[0];
    return name === sessionCookieName;
  });
}
