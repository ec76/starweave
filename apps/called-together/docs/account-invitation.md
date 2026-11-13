# Account invitation and setup

Ticket: [#24](https://github.com/ec76/starweave/issues/24), part of the
[editorial milestone](https://github.com/ec76/starweave/issues/23).

An Administrator creates an account with at least one independently assigned
Writer, Approver, or Administrator role. Existing account management persists the
account, invitation, assigned roles, safe-link notification, and attributed activity
in its existing transaction. SQL reauthorizes the current Administrator session.
Administrator alone does not grant Writer or Approver permissions.

The notification links to `/admin/setup` without a bearer credential. The recipient
requests their own five-minute, single-use code and chooses a password. Successful
setup confirms completion on the sign-in page; it does not sign the person in.
Existing credential operations retain password hashing, invitation eligibility,
session policy, and setup audit records.

## Invitation feedback and recovery

Account creation and email delivery are separate outcomes. After creation, the
account-management screen distinguishes:

- **Invitation accepted:** the configured email service accepted the safe-link
  notification and its outbox record was updated. This does not prove inbox delivery.
- **Delivery unconfirmed:** account creation succeeded, but sending or recording
  delivery failed, or no pending notification was confirmed. Do not create another
  account. Share the credential-free setup page with the recipient and check email
  delivery with the site operator.

Pending outbox records remain eligible for the existing notification-delivery
operator. Its default is a dry run; sending requires explicit `--run`. It retries
up to five pending notifications using the configured provider. A timeout can occur
after provider acceptance, so an unconfirmed result does not prove that no email
was sent. Existing provider idempotency behavior remains unchanged.

Public setup-code requests retain generic responses regardless of account
eligibility or delivery outcome. Setup failure guidance covers invalid/expired
codes and expired invitations without disclosing account existence. No recipient
addresses, credentials, codes, or provider errors are added to redirect parameters.

## Verification

Automated route tests exercise the real CSRF and management service boundaries
with controlled repository/delivery results, including permission denial and
delivery failure. Existing installed-library password tests cover setup, single-use
and expired codes, password sign-in, and sign-out. UI tests cover invitation notices,
independent role selection, and query-driven setup guidance. Storybook includes
accepted and unconfirmed invitation states.

The existing opt-in auth SQL verifier exercises the full account creation,
Mailpit notification, setup, password login, role-change, and audit journey against
an explicitly selected disposable verification database. Local automated tests do
not establish live SQL grants or actual inbox delivery. No new migration or
permission change is required for this ticket, and no live SQL/email mutation was
performed during implementation.
