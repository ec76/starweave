import LoadingView from "./loading";
import type { ActivityEvent } from "../../domain/activity";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "../theme-provider";
import { AdminShell, AdminPageHeader } from "./admin-shell";
import { DashboardView } from "./dashboard-view";
import { AccountsView, AccountSearchError } from "./accounts/accounts-view";
import { AccountManagement, AuthActionForm } from "./admin-views";
const meta = {
  title: "Called Together/Admin workspace",
  component: AdminShell,
  args: {
    accountName: "Morgan Example",
    actions: <AuthActionForm action="logout" csrfToken="" />,
  },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof AdminShell>;
export default meta;
type Story = StoryObj<typeof meta>;
const recent: ActivityEvent[] = [
  "account_created",
  "setup_completed",
  "login",
].map((eventType, i) => ({
  id: String(i),
  occurredAt: "2026-11-12T18:0" + i + ":00.000Z",
  eventType: eventType as ActivityEvent["eventType"],
  outcome: "success",
  actorKind: "account",
  actingAccountId: "11111111-1111-4111-8111-111111111111",
  targetAccountId: "22222222-2222-4222-8222-222222222222",
  articleId: null,
  revisionId: null,
  role: null,
  reason: "completed",
  correlationId: "33333333-3333-4333-8333-333333333333",
  attempts: 1,
}));
export const Administrator: Story = {
  args: {
    section: "dashboard",
    roles: ["Administrator"],
    children: (
      <>
        <AdminPageHeader
          title="Dashboard"
          description="Welcome, Example Administrator"
        />
        <DashboardView
          administrator
          summary={{
            counts: { active: 4, pending: 2, disabled: 1 },
            events: recent,
          }}
        />
      </>
    ),
  },
};
export const Writer: Story = {
  args: {
    section: "dashboard",
    roles: ["Writer"],
    children: (
      <>
        <AdminPageHeader title="Dashboard" />
        <DashboardView administrator={false} />
      </>
    ),
  },
};
export const UnavailableSummary: Story = {
  args: {
    ...Administrator.args,
    children: (
      <>
        <AdminPageHeader title="Dashboard" />
        <DashboardView administrator summary={{ counts: null, events: null }} />
      </>
    ),
  },
};
const filter = { q: "", status: "", role: "", page: 1 } as const;
export const AccountSearch: Story = {
  args: {
    section: "accounts",
    roles: ["Administrator"],
    children: (
      <>
        <AdminPageHeader
          title="Accounts"
          description="Search account access and security."
        />
        <AccountsView filter={filter} count={3} previous={null} next={null}>
          <AccountManagement
            csrfToken="preview-only"
            listDescription="25 accounts per page"
            accounts={[
              {
                id: "11111111-1111-4111-8111-111111111111",
                name: "A long fictional display name for responsive wrapping",
                email: "fictional-preview@example.invalid",
                disabled: false,
                activatedAt: null,
                roles: ["Writer"],
              },
              {
                id: "22222222-2222-4222-8222-222222222222",
                name: "Example active approver",
                email: "approver@example.invalid",
                disabled: false,
                activatedAt: "2026-11-11T10:00:00.000Z",
                roles: ["Approver"],
              },
              {
                id: "33333333-3333-4333-8333-333333333333",
                name: "Example disabled account",
                email: "disabled@example.invalid",
                disabled: true,
                activatedAt: "2026-11-10T10:00:00.000Z",
                roles: ["Writer"],
              },
            ]}
          />
        </AccountsView>
      </>
    ),
  },
};
export const EmptySearch: Story = {
  args: {
    ...AccountSearch.args,
    children: (
      <>
        <AdminPageHeader title="Accounts" />
        <AccountsView
          filter={{ ...filter, q: "No matches" }}
          count={0}
          previous={null}
          next={null}
        >
          {null}
        </AccountsView>
      </>
    ),
  },
};
export const Mobile: Story = {
  ...AccountSearch,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

export const Loading: Story = {
  args: { ...Administrator.args, children: <LoadingView /> },
};
export const SearchError: Story = {
  args: {
    ...AccountSearch.args,
    children: (
      <>
        <AdminPageHeader title="Accounts" />
        <AccountSearchError />
      </>
    ),
  },
};
