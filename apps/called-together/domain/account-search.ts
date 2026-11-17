import { accountRoles } from "./accounts.ts";

export const accountPageSize = 25;
export const accountStatuses = ["active", "pending", "disabled"] as const;
export interface AccountFilter {
  q: string;
  status: "" | (typeof accountStatuses)[number];
  role: "" | (typeof accountRoles)[number];
  page: number;
}
export function accountFilter(
  params: Record<string, string | string[] | undefined>,
): AccountFilter {
  if (Object.values(params).some(Array.isArray))
    throw new Error("Repeated filters are not allowed.");
  const value = (key: string, fallback = "") =>
    typeof params[key] === "string" ? params[key] : fallback;
  const q = value("q").trim();
  const status = value("status");
  const role = value("role");
  const page = value("page", "1");
  if (
    q.length > 254 ||
    /[\x00-\x1f\x7f]/.test(q) ||
    !/^\d{1,5}$/.test(page) ||
    Number(page) < 1 ||
    Number(page) > 10000 ||
    (status &&
      !accountStatuses.includes(status as (typeof accountStatuses)[number])) ||
    (role && !accountRoles.includes(role as (typeof accountRoles)[number]))
  )
    throw new Error("Invalid account filters.");
  return {
    q,
    status: status as AccountFilter["status"],
    role: role as AccountFilter["role"],
    page: Number(page),
  };
}
export function accountSearchHref(filter: AccountFilter, page: number) {
  const query = new URLSearchParams();
  if (filter.q) query.set("q", filter.q);
  if (filter.status) query.set("status", filter.status);
  if (filter.role) query.set("role", filter.role);
  query.set("page", String(page));
  return "/admin/accounts?" + query;
}
