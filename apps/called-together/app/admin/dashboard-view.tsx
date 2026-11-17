import { Alert, Button, Stack, Typography, Box, Link } from "@mui/material";
import type { ActivityEvent } from "../../domain/activity";
import { AdminPanel } from "./admin-shell";
import { ActivityTime } from "./activity-time";
export interface DashboardSummary {
  counts: { active: number; pending: number; disabled: number } | null;
  events: readonly ActivityEvent[] | null;
}
export function DashboardView({
  administrator,
  summary,
}: {
  administrator: boolean;
  summary?: DashboardSummary;
}) {
  if (!administrator)
    return (
      <AdminPanel title="Your workspace">
        <Typography>
          Your access is ready. Article and author tools are planned and are not
          available yet.
        </Typography>
        <Typography sx={{ mt: 2 }}>
          Contact an Administrator if you need help with your account.
        </Typography>
      </AdminPanel>
    );
  return (
    <Stack spacing={3}>
      <AdminPanel title="Account administration">
        <Stack
          direction={{ xs: "column", sm: "row" }}
          useFlexGap
          sx={{ gap: 2, flexWrap: "wrap" }}
        >
          <Button variant="contained" href="/admin/accounts">
            Find an account
          </Button>
          <Button variant="outlined" href="/admin/accounts#create-account">
            Create account
          </Button>
          <Button href="/admin/activity">View activity</Button>
        </Stack>
      </AdminPanel>
      <AdminPanel title="Accounts now">
        {summary?.counts ? (
          <Box
            component="dl"
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(3,1fr)" },
              gap: 3,
              m: 0,
            }}
          >
            {(["active", "pending", "disabled"] as const).map((key) => (
              <Box key={key}>
                <Typography component="dt">
                  {key === "pending"
                    ? "Pending setup"
                    : key === "active"
                      ? "Active"
                      : "Disabled"}
                </Typography>
                <Typography component="dd" variant="h2" sx={{ m: 0 }}>
                  {summary.counts![key]}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : (
          <Alert severity="info">
            Account counts are unavailable. You can still open account search.
          </Alert>
        )}
      </AdminPanel>
      <AdminPanel title="Recent activity">
        {summary?.events ? (
          summary.events.length ? (
            <Box component="ul" sx={{ m: 0, pl: 3 }}>
              {summary.events.map((event) => (
                <li key={event.id}>
                  <Typography>
                    {event.eventType.replaceAll("_", " ")} · {event.outcome}
                  </Typography>
                  <Typography
                    component="div"
                    variant="body2"
                    color="text.secondary"
                  >
                    <ActivityTime instant={event.occurredAt} />
                  </Typography>
                </li>
              ))}
            </Box>
          ) : (
            <Typography>No activity recorded yet.</Typography>
          )
        ) : (
          <Alert severity="info">Recent activity is unavailable.</Alert>
        )}
        <Link href="/admin/activity" sx={{ display: "inline-block", mt: 2 }}>
          Open activity
        </Link>
      </AdminPanel>
    </Stack>
  );
}
