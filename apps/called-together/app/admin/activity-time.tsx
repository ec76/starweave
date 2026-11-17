"use client";
import { useSyncExternalStore } from "react";
import { Box, Tooltip } from "@mui/material";

const serverSnapshot = () => "";
function viewerSnapshot() {
  const { locale, timeZone } = Intl.DateTimeFormat().resolvedOptions();
  return JSON.stringify({ locale, timeZone });
}
function subscribe(refresh: () => void) {
  window.addEventListener("languagechange", refresh);
  window.addEventListener("focus", refresh);
  return () => {
    window.removeEventListener("languagechange", refresh);
    window.removeEventListener("focus", refresh);
  };
}
function validInstant(instant: string) {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(instant) &&
    Number.isFinite(Date.parse(instant))
  );
}
/** Presentation only. Never changes the API's UTC instant or event ordering. */
export function formatActivityTimestamp(
  instant: string,
  locale: string,
  timeZone: string,
) {
  const date = new Date(instant);
  const common = {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "shortOffset",
  } as const;
  return {
    label: new Intl.DateTimeFormat(locale, common).format(date),
    full: new Intl.DateTimeFormat(locale, {
      ...common,
      weekday: "long",
      month: "long",
      second: "2-digit",
      timeZoneName: "longOffset",
    }).format(date),
    timeZone,
  };
}
export function ActivityTimeDisplay({
  instant,
  label,
  full,
  timeZone,
}: {
  instant: string;
  label: string;
  full: string;
  timeZone: string;
}) {
  return (
    <Tooltip describeChild title={`${full} (${timeZone})`}>
      <Box
        component="time"
        dateTime={instant}
        tabIndex={0}
        sx={{
          display: "inline-block",
          borderRadius: 1,
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: 2,
          },
        }}
      >
        {label}{" "}
        <Box component="span" sx={{ color: "text.secondary" }}>
          ({timeZone})
        </Box>
      </Box>
    </Tooltip>
  );
}
export function ActivityTime({ instant }: { instant: string }) {
  // React uses the same server snapshot during SSR and the first hydration pass.
  // Browser locale/timezone is read only after hydration; no server-zone guess.
  const viewer = useSyncExternalStore(
    subscribe,
    viewerSnapshot,
    serverSnapshot,
  );
  if (!validInstant(instant)) return <span>Time unavailable</span>;
  const formatted = viewer
    ? (() => {
        const { locale, timeZone } = JSON.parse(viewer) as {
          locale: string;
          timeZone: string;
        };
        return formatActivityTimestamp(instant, locale, timeZone);
      })()
    : {
        label: instant,
        full: `${instant}; local time is available after loading`,
        timeZone: "UTC",
      };
  return <ActivityTimeDisplay instant={instant} {...formatted} />;
}
