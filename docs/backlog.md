# Backlog

## Called Together admin usability

Status: Phase 1 implemented; visual review and owner verification pending

Improve the admin interface’s navigation, account list, role controls, account
status, action labels, and success/error feedback. Use mobile-first layouts,
accessible controls, and presentational components without business logic.

Owner feedback: the current interface is difficult to use. This work is separate
from the Resend implementation.

Completed in the first navigation phase:

- Role-appropriate dashboard with Administrator shortcuts, aggregate account
  counts and recent activity; no account data for Writer/Approver.
- Desktop sidebar, mobile drawer, compact account/sign-out bar, breadcrumbs,
  page headers and reusable panels in Called Together's theme.
- Administrator-only account search with URL-based name/email, status and role
  filters, bounded server-side pagination, and existing management controls.
- Existing Administrator activity page within the same shell.
- Storybook populated/mobile/loading/empty/error states and regression coverage.

Remaining phases:

1. Account detail, focused security controls and account-specific history.
2. Dedicated account creation and retirement of the old combined interface.
3. Future article/author tools. Author profiles represent public attribution;
   accounts represent access/security. No placeholder pages or links.

See [workspace architecture and owner retest](../apps/called-together/docs/admin-workspace.md).

Observed during the November 12 hosted development verification: the display name
showed extra caret (`^`) characters. Investigate the source and rendering path;
the cause is not established. Include this in the future usability work rather
than changing account data or implementing a fix in the verification record.
