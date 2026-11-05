import { describe, expect, it } from "vitest";
import {
  isArticleBody,
  isArticleLanguage,
  isRevisionStatus,
  isReviewOutcome,
  isRowVersion,
  isSlug,
} from "./editorial.js";

describe("editorial domain boundaries", () => {
  it("limits the initial languages and distinguishes review outcomes from draft states", () => {
    expect(isArticleLanguage("en")).toBe(true);
    expect(isArticleLanguage("es")).toBe(true);
    for (const value of ["en-US", "fr", null, 1])
      expect(isArticleLanguage(value)).toBe(false);
    for (const status of [
      "draft",
      "submitted",
      "changes_requested",
      "approved",
    ])
      expect(isRevisionStatus(status)).toBe(true);
    expect(isRevisionStatus("published")).toBe(false);
    expect(isReviewOutcome("approved")).toBe(true);
    expect(isReviewOutcome("changes_requested")).toBe(true);
    expect(isReviewOutcome("draft")).toBe(false);
  });
  it("uses a route-safe shared slug convention with a bounded length", () => {
    expect(isSlug("ideas-en-comunidad-2")).toBe(true);
    expect(isSlug("a".repeat(160))).toBe(true);
    for (const value of [
      "",
      "a".repeat(161),
      "A-title",
      "two--parts",
      "-start",
      "end-",
      "two words",
      "../route",
      "hola/ideas",
      null,
    ])
      expect(isSlug(value)).toBe(false);
  });
  it("represents concurrency tokens as exactly eight opaque bytes", () => {
    expect(isRowVersion("0x00000000000000AF")).toBe(true);
    for (const value of [
      "1",
      "0x01",
      "0x00000000000000000",
      "0x00000000000000xz",
      1,
    ])
      expect(isRowVersion(value)).toBe(false);
  });
  it("accepts a library-neutral versioned JSON envelope and rejects unknown or non-JSON bodies", () => {
    const envelope = (content: unknown) => ({
      version: 1,
      format: "called-together.rich-text",
      content,
    });
    expect(
      isArticleBody(
        envelope({ blocks: [{ text: "Example", properties: null }], count: 1 }),
      ),
    ).toBe(true);
    for (const value of [
      null,
      [],
      {},
      { version: 2, format: "called-together.rich-text", content: {} },
      envelope(null),
      envelope([]),
      envelope({ number: Infinity }),
      envelope({ number: NaN }),
      envelope({ omitted: undefined }),
      envelope({ date: new Date() }),
      envelope({ fn: () => 1 }),
      envelope({ sparse: Array(2) }),
    ])
      expect(isArticleBody(value)).toBe(false);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(isArticleBody(envelope(cycle))).toBe(false);
    let deep: unknown = {};
    for (let i = 0; i < 70; i++) deep = { nested: deep };
    expect(isArticleBody(envelope(deep))).toBe(false);
    // Text is data, not a promise that rendering it as HTML would be safe.
    expect(
      isArticleBody(envelope({ text: "<script>untrusted</script>" })),
    ).toBe(true);
  });
});
