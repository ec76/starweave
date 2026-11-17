# Admin workspace: navigation phase

## Routes and presentation

- `/admin`: role-appropriate dashboard. Administrators receive working search,
  creation and activity shortcuts. Counts aggregate AuthUsers; recent activity
  uses the first three entries returned by the existing AuthListActivity service.
  These are separate snapshots, not a transactionally consistent report. Either
  summary can fail without blocking the dashboard.
- `/admin/accounts`: Administrator-only search with status/role filters and
  25-row pages. Existing creation, role changes, enable/disable and session
  revocation remain available. Creation is a focused disclosure at
  `#create-account`. No detail links exist until that route is implemented.
  Mutations redirect here with feedback; creation success does not prove email
  delivery. The existing CSRF, service/procedure reauthorization, audit and
  last-active-Administrator protections remain unchanged.
- `/admin/activity`: existing Administrator-only service/filtering in the same
  shell. No change to its SQL procedure or authorization.

Writer/Approver dashboards contain no account-management links, counts or activity.
Administrator does not imply Writer/Approver. Articles and Authors have no empty
pages/navigation. Public author attribution remains separate from account security.

The [official MUI Dashboard reference](https://mui.com/material-ui/getting-started/templates/dashboard/)
informs the sidebar, compact context/account bar, breadcrumbs and panel hierarchy.
Only installed MUI and the existing Next.js router are used. No template source,
framework, charts or dependencies were added. Client state only controls drawer
disclosure; authentication, SQL and account operations remain server-side.

## Query and permission boundary

`domain/account-search.ts` validates `q` up to 254 characters, an existing role,
`status=active|pending|disabled`, and integer `page=1..10000`. Repeated values are
rejected. Empty filters mean all values. Page links preserve filters; a new GET
search resets to page 1. Parameterized CHARINDEX performs case-insensitive literal
substring search: `%` and `_` are not wildcards. Ordering is createdAt descending
then id; 26 fetched rows detect the next 25-row page. Maximum offset is 249975.
No whole-account-store download or browser-side filtering is used.

`server/admin/account-search.ts` requires Administrator before SQL acquisition and
revalidates filters. Search projects only id, name, email, status and roles. Counts
read AuthUsers; search reads AuthUsers/AuthRoleAssignments. These are existing
SELECT rights used by the old account list. No SQL object, migration, grant or
credential/audit-table access is added. Applied migrations remain unchanged.

The protected layout remains `force-dynamic`, `revalidate=0`, noindex/nofollow.
Isolated production checks verify no-store responses and anonymous rejection for
account/activity routes without database or email-provider access.

## Timestamp presentation and encoding

Dashboard and activity-list timestamps share `app/admin/activity-time.tsx`.
Server rendering and the first hydration pass show the original ISO timestamp
labelled UTC. After hydration, Intl.DateTimeFormat uses the viewer's browser
locale/timezone. Each displayed time includes its IANA timezone and UTC offset;
hovering or keyboard-focusing it reveals the full localized date/time, including
seconds and offset. Repeated fall-back times remain distinguishable. The `<time>`
element retains the original UTC `dateTime`. Storage, API values, UTC date-filter
boundaries and result ordering are unchanged.

The top-bar separator was a literal ASCII `?` in source. The local PowerShell
native pipeline uses ASCII and reproduces conversion of the intended middle dot
to `?`. MUI Breadcrumbs now uses an explicit ASCII `/` separator. A UTF-8 scan of
the admin source found no other replacement characters or mojibake. No shell or
Git encoding settings were changed.

## Storybook review and owner retest

**Called Together / Admin workspace** has Administrator/Writer, realistic
fictional account statuses, recent events, mobile, loading, empty, unavailable
summary and search-error examples. Do not submit preview forms to a live app.
Start with `npm.cmd run storybook` from the root. Review 320, 390, 768 and 1440px,
200% text, long names, labels and mobile keyboard focus/Escape before live SQL.

The owner-reported November 16 local test verified invitation, setup, sign-in,
Writer/Approver role retention, Administrator-page denial and logout against the
disposable database with Mailpit. See [the focused verification record](account-invitation.md).
Search, pagination, dashboard summaries and the visual checks below still need
their own owner review using the existing configured app and accounts:

1. Sign in as the existing Administrator. Check dashboard shortcuts, counts and
   recent activity against separately reviewed read-only results. Separate queries
   do not promise synchronized counts/activity.
2. Search an existing account by name/email; combine role/status filters. Follow
   page links and reload/copy the URL to verify state retention. Repeated or
   out-of-range filters must fail without returning account data.
3. Open creation and existing security controls, but do not submit changes or
   send invitations merely to verify navigation. Mutation testing needs separate
   authorization and the existing account-management verification procedure.
4. Sign in as an existing Writer/Approver: no account-management data on the
   dashboard; direct `/admin/accounts` and `/admin/activity` access must be denied.
5. Sign out and verify protected access is rejected. Inspect private no-store
   cache headers and noindex metadata without recording cookie/session values.

No bootstrap, migrations, permission changes, cleanup or new database are needed.
Earlier owner-reported hosted/Resend evidence does not verify this phase.
