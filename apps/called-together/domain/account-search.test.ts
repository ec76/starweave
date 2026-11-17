import { expect, it } from "vitest";
import { accountFilter, accountSearchHref } from "./account-search";
it.each([
  { page: "0" },
  { page: "10001" },
  { page: "1.5" },
  { page: "1e2" },
  { page: "-1" },
  { page: ["1", "2"] },
  { q: ["a", "b"] },
  { q: "x".repeat(255) },
  { q: "line\nbreak" },
  { role: "Owner" },
  { status: "enabled" },
])("rejects invalid or repeated URL filters %j", (params) => {
  expect(() => accountFilter(params)).toThrow();
});
it("round-trips search, role and status through pagination without losing or injecting URL state", () => {
  const filter = accountFilter({
    q: " A & B@example.invalid ",
    status: "pending",
    role: "Approver",
    page: "2",
  });
  const url = new URL(accountSearchHref(filter, 3), "https://fixture.invalid");
  expect(accountFilter(Object.fromEntries(url.searchParams))).toEqual({
    ...filter,
    page: 3,
  });
  expect(accountFilter({})).toEqual({ q: "", status: "", role: "", page: 1 });
});
