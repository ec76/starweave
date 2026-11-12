import { Stack, Typography, TextField, Button, Link, Box } from "@mui/material";
import { activityTypes, type ActivityEvent } from "../../../domain/activity";
export function ActivityView({
  events,
  previous,
  next,
}: {
  events: readonly ActivityEvent[];
  previous: string | null;
  next: string | null;
}) {
  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h1">
        Account and editorial activity
      </Typography>
      <Typography>
        Security entries are hourly aggregates. Times are UTC. Editorial actions
        appear when their services are implemented.
      </Typography>
      <Stack component="form" method="get" spacing={2}>
        <TextField name="account" label="Account ID" />
        <TextField
          name="event"
          select
          label="Event type"
          defaultValue=""
          slotProps={{ select: { native: true } }}
        >
          <option value="">All events</option>
          {[
            ...activityTypes,
            "login_failed",
            "code_requested",
            "code_rejected",
            "reset_failed",
          ].map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </TextField>
        <TextField
          name="from"
          label="From (inclusive, UTC)"
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          name="until"
          label="Until (exclusive, UTC)"
          type="date"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button type="submit">Filter activity</Button>
      </Stack>
      <Box component="ol" sx={{ pl: 3 }}>
        {events.map((event) => (
          <Box
            component="li"
            key={event.id}
            sx={{ mb: 3, overflowWrap: "anywhere" }}
          >
            <Typography>
              {event.occurredAt} · {event.eventType} · {event.outcome}
            </Typography>
            <Typography>
              Actor: {event.actorKind} {event.actingAccountId ?? ""} · Target:{" "}
              {event.targetAccountId ?? event.articleId ?? "System"}
            </Typography>
            {event.revisionId && (
              <Typography>Revision: {event.revisionId}</Typography>
            )}
            {event.role && <Typography>Role: {event.role}</Typography>}
            <Typography>
              Reason: {event.reason} · Count: {event.attempts} · Event:{" "}
              {event.id} · Correlation: {event.correlationId}
            </Typography>
          </Box>
        ))}
      </Box>
      {events.length === 0 && <Typography>No matching activity.</Typography>}
      <Stack direction="row" spacing={3}>
        {previous && <Link href={previous}>Previous page</Link>}
        {next && <Link href={next}>Next page</Link>}
      </Stack>
      <Link href="/admin">Back to admin</Link>
    </Stack>
  );
}
