import type { Meta, StoryObj } from "@storybook/react-vite";
import { InvitationNotice } from "./account-feedback";
import { ThemeProvider } from "../theme-provider";

const meta = {
  title: "Called Together/Account invitation",
  component: InvitationNotice,
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
  parameters: { layout: "padded" },
} satisfies Meta<typeof InvitationNotice>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Accepted: Story = { args: { outcome: "invited" } };
export const DeliveryUnconfirmed: Story = {
  args: { outcome: "invitation_pending" },
};
