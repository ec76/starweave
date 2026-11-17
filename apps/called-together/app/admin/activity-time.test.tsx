// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ActivityTime,
  ActivityTimeDisplay,
  formatActivityTimestamp,
} from "./activity-time";
import { ActivityView } from "./activity/activity-view";
import type { ActivityEvent } from "../../domain/activity";
const instant = "2026-11-01T05:30:45.000Z";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each([
  ["America/New_York", "2026-03-08T06:59:00.000Z", "1:59", "GMT-5"],
  ["America/New_York", "2026-03-08T07:00:00.000Z", "3:00", "GMT-4"],
  ["America/New_York", "2026-11-01T05:30:00.000Z", "1:30", "GMT-4"],
  ["America/New_York", "2026-11-01T06:30:00.000Z", "1:30", "GMT-5"],
  ["Europe/London", "2026-03-29T00:59:00.000Z", "12:59", "GMT"],
  ["Europe/London", "2026-03-29T01:00:00.000Z", "2:00", "GMT+1"],
  ["Asia/Kathmandu", "2026-11-01T00:00:00.000Z", "5:45", "GMT+5:45"],
])(
  "formats %s at %s with DST-aware local time and offset",
  (zone, value, time, offset) => {
    const formatted = formatActivityTimestamp(value, "en-US", zone);
    expect(formatted.label).toContain(time);
    expect(formatted.label).toContain(offset);
    expect(formatted.timeZone).toBe(zone);
  },
);
it("preserves the UTC instant across local date rollover and repeated fall-back times", () => {
  const values = ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"];
  const original = [...values];
  const labels = values.map((value) =>
    formatActivityTimestamp(value, "en-US", "America/New_York"),
  );
  expect(labels[0]!.full).not.toBe(labels[1]!.full);
  expect(values).toEqual(original);
  expect(
    formatActivityTimestamp(
      "2026-11-01T12:00:00.000Z",
      "en-US",
      "Pacific/Auckland",
    ).label,
  ).toContain("Nov 2");
  const { container } = render(
    <ActivityTimeDisplay
      instant={instant}
      {...formatActivityTimestamp(instant, "en-US", "America/New_York")}
    />,
  );
  expect(container.querySelector("time")!.getAttribute("datetime")).toBe(
    instant,
  );
});
it.each(["focus", "hover"])(
  "exposes the complete local date, seconds and timezone on %s",
  async (interaction) => {
    const user = userEvent.setup();
    const formatted = formatActivityTimestamp(
      instant,
      "en-US",
      "America/New_York",
    );
    const { container } = render(
      <ActivityTimeDisplay instant={instant} {...formatted} />,
    );
    const time = container.querySelector("time")!;
    if (interaction === "focus") await user.tab();
    else await user.hover(time);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toBe(`${formatted.full} (America/New_York)`);
    expect(formatted.full).toContain("1:30:45");
    expect(formatted.full).toContain("GMT-04:00");
    expect(time.getAttribute("aria-describedby")).toBe(tooltip.id);
  },
);
it("SSR never consults a timezone and hydrates with a stable UTC initial render before localizing", async () => {
  const original = Intl.DateTimeFormat;
  const serverFormatter = vi
    .spyOn(Intl, "DateTimeFormat")
    .mockImplementation(() => {
      throw new Error("SSR must not resolve viewer timezone");
    });
  const html = renderToString(<ActivityTime instant={instant} />);
  expect(serverFormatter).not.toHaveBeenCalled();
  expect(html).toContain(instant);
  expect(html).toContain("UTC");
  serverFormatter.mockRestore();
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
    function (locale, options) {
      return new original(locale ?? "en-US", {
        ...options,
        timeZone: options?.timeZone ?? "America/New_York",
      });
    },
  );
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  const recovered = vi.fn();
  let root: Root;
  try {
    await act(async () => {
      root = hydrateRoot(container, <ActivityTime instant={instant} />, {
        onRecoverableError: recovered,
      });
    });
    await waitFor(() =>
      expect(container.querySelector("time")!.textContent).toContain(
        "America/New_York",
      ),
    );
    expect(recovered).not.toHaveBeenCalled();
    expect(container.querySelector("time")!.getAttribute("datetime")).toBe(
      instant,
    );
  } finally {
    await act(async () => root?.unmount());
    container.remove();
  }
});
it("does not interpret timezone-less or invalid values as browser-local instants", () => {
  const { container } = render(<ActivityTime instant="2026-11-01T01:30:00" />);
  expect(container.querySelector("time")).toBeNull();
  expect(container.textContent).toContain("Time unavailable");
});
it("keeps activity-list UTC ordering and UTC filter semantics while presenting local times", () => {
  const instants = ["2026-11-01T06:30:00.000Z", "2026-11-01T05:30:00.000Z"];
  const events: ActivityEvent[] = instants.map((occurredAt, i) => ({
    id: String(i),
    occurredAt,
    eventType: "login",
    outcome: "success",
    actorKind: "account",
    actingAccountId: null,
    targetAccountId: null,
    articleId: null,
    revisionId: null,
    role: null,
    reason: "completed",
    correlationId: "fixture",
    attempts: 1,
  }));
  const { container } = render(
    <ActivityView events={events} previous={null} next={null} />,
  );
  expect(
    [...container.querySelectorAll("time")].map((time) =>
      time.getAttribute("datetime"),
    ),
  ).toEqual(instants);
  expect(
    (screen.getByLabelText("From (inclusive, UTC)") as HTMLInputElement).name,
  ).toBe("from");
  expect(
    (screen.getByLabelText("Until (exclusive, UTC)") as HTMLInputElement).name,
  ).toBe("until");
  expect(events.map((event) => event.occurredAt)).toEqual(instants);
});
