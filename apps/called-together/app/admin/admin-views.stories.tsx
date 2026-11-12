import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "../theme-provider";
import {
  AdminLanding,
  AdminAccessDenied,
  AdminUnavailable,
  AuthActionForm,
  AccountManagement,
} from "./admin-views";
const meta = {
  title: "Called Together/Admin foundation",
  component: AdminLanding,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof AdminLanding>;
export default meta;
type Story = StoryObj<typeof meta>;
const session = {
  id: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  actorId: "00000000-0000-4000-8000-000000000002",
  email: "fictional@example.invalid",
  identity: {
    issuer: "https://fictional.invalid",
    subject: "fictional-preview-only",
    displayName: "Example editor (fictional)",
  },
  roles: ["Writer", "Approver"] as const,
  expiresAt: 0,
};
export const DualRole: Story = {
  args: { session, children: <AuthActionForm action="logout" csrfToken="" /> },
};
export const Writer: Story = {
  args: { ...DualRole.args, session: { ...session, roles: ["Writer"] } },
};
export const AccessDenied: Story = {
  args: DualRole.args,
  render: () => (
    <AdminAccessDenied>
      <AuthActionForm action="logout" csrfToken="" />
    </AdminAccessDenied>
  ),
};
export const Unconfigured: Story = {
  args: DualRole.args,
  render: () => <AdminUnavailable />,
};
export const Administrator: Story = {
  args: {
    session: { ...session, roles: ["Administrator"] },
    children: (
      <>
        <AuthActionForm action="logout" csrfToken="" />
        <AccountManagement
          csrfToken=""
          accounts={[
            {
              id: session.userId,
              name: "Example invitee (fictional)",
              email: "invitee@example.invalid",
              disabled: false,
              roles: ["Writer", "Approver"],
            },
          ]}
        />
      </>
    ),
  },
};
export const PasswordSignIn: Story = {
  args: DualRole.args,
  render: () => <AuthActionForm action="login" csrfToken="" />,
};
export const AccountSetup: Story = {
  args: DualRole.args,
  render: () => <AuthActionForm action="setup" csrfToken="" />,
};
export const PasswordRecovery: Story = {
  args: DualRole.args,
  render: () => <AuthActionForm action="reset" csrfToken="" />,
};
