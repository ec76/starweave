import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProfileEditor } from "./profile-editor";
import { ThemeProvider } from "../../theme-provider";
const meta = {
  title: "Called Together/Author profiles",
  component: ProfileEditor,
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ProfileEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const NewProfile: Story = { args: { profile: null } };
export const RetainedHistory: Story = {
  args: {
    profile: {
      id: "11111111-1111-4111-8111-111111111111",
      latestRevisionId: "22222222-2222-4222-8222-222222222222",
      revisions: [2, 1].map((number) => ({
        id: `revision-${number}`,
        number,
        displayName: number === 2 ? "Elena Rivera" : "Elena",
        biography:
          number === 2
            ? "Writing about community, service, and shared faith.\nThis replacement remains private until approved."
            : "Writing about community.",
        affiliation: "Called Together",
        photoUrl: "",
        photoAlt: "",
        savedAt: "2026-11-13T14:00:00.000Z",
        savedBy: "Elena Rivera",
        actorId: "33333333-3333-4333-8333-333333333333",
      })),
    },
  },
};
