import "server-only";
import { ArticleInputError } from "./public-articles";

export function articleJson(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function articleFailure(error: unknown): Response {
  if (error instanceof ArticleInputError)
    return articleJson({ error: "Invalid article request." }, 400);
  // Do not expose driver diagnostics, server names, credentials or stored content.
  return articleJson(
    { error: "Published articles are temporarily unavailable." },
    503,
  );
}
