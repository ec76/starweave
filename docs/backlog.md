# Backlog

## Called Together admin usability

Status: Planned

Improve the admin interface’s navigation, account list, role controls, account
status, action labels, and success/error feedback. Use mobile-first layouts,
accessible controls, and presentational components without business logic.

Owner feedback: the current interface is difficult to use. This is a separate
future task; do not implement it in the Resend PR.

Observed during the November 12 hosted development verification: the display name
showed extra caret (`^`) characters. Investigate the source and rendering path;
the cause is not established. Include this in the future usability work rather
than changing account data or implementing a fix in the verification record.
