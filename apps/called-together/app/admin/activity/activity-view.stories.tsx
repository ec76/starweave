import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "../../theme-provider";
import { ActivityView } from "./activity-view";
const meta = {
  title: "Called Together/Activity",
  component: ActivityView,
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ActivityView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {
  args: { events: [], previous: null, next: null },
};
export const AccountCreated: Story = {
  args: {
    previous: null,
    next: "/admin/activity?page=2",
    events: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        occurredAt: "2026-11-11T12:00:00.000Z",
        eventType: "account_created",
        outcome: "success",
        actorKind: "operator",
        actingAccountId: null,
        targetAccountId: "22222222-2222-4222-8222-222222222222",
        articleId: null,
        revisionId: null,
        role: null,
        reason: "completed",
        correlationId: "33333333-3333-4333-8333-333333333333",
        attempts: 1,
      },
    ],
  },
};
