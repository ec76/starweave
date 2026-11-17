import type { Meta, StoryObj } from "@storybook/react-vite";
import { Stack, Typography } from "@mui/material";
import { ThemeProvider } from "../theme-provider";
import {
  ActivityTime,
  ActivityTimeDisplay,
  formatActivityTimestamp,
} from "./activity-time";
const meta = {
  title: "Called Together/Admin workspace/Activity time",
  component: ActivityTime,
  decorators: [
    (Story) => (
      <ThemeProvider>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof ActivityTime>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ViewerLocal: Story = {
  args: { instant: "2026-11-12T18:45:32.000Z" },
};
export const InitialUtcPlaceholder: Story = {
  args: ViewerLocal.args,
  render: ({ instant }) => (
    <ActivityTimeDisplay
      instant={instant}
      label={instant}
      full={`${instant}; local time is available after loading`}
      timeZone="UTC"
    />
  ),
};
export const DaylightSavingAndTimezones: Story = {
  args: ViewerLocal.args,
  render: () => (
    <Stack spacing={3}>
      {[
        "America/New_York",
        "Europe/London",
        "Asia/Kathmandu",
        "Pacific/Auckland",
      ].map((zone) => (
        <Stack key={zone} spacing={1}>
          <Typography component="h2" variant="h3">
            {zone} preview
          </Typography>
          {[
            "2026-03-08T06:59:00.000Z",
            "2026-03-08T07:00:00.000Z",
            "2026-11-01T05:30:45.000Z",
            "2026-11-01T06:30:45.000Z",
          ].map((instant) => (
            <ActivityTimeDisplay
              key={instant}
              instant={instant}
              {...formatActivityTimestamp(instant, "en-US", zone)}
            />
          ))}
        </Stack>
      ))}
    </Stack>
  ),
};
