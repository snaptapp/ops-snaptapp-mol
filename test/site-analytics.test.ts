import { describe, expect, it } from "vitest";
import { formatGaDate, pickPreferredEntry } from "../src/lib/admin/site-analytics.server";

describe("formatGaDate", () => {
  it("formats GA4 YYYYMMDD dates as M/D", () => {
    expect(formatGaDate("20261103")).toBe("11/3");
    expect(formatGaDate("20260101")).toBe("1/1");
    expect(formatGaDate("20261225")).toBe("12/25");
  });

  it("passes through values that are not 8-digit dates", () => {
    expect(formatGaDate("")).toBe("");
    expect(formatGaDate("2026-11-03")).toBe("2026-11-03");
  });
});

describe("pickPreferredEntry", () => {
  it("prefers the snaptapp.us entry over others", () => {
    expect(
      pickPreferredEntry(["https://trackdub.com/", "sc-domain:snaptapp.us", "https://mesalim.com/"]),
    ).toBe("sc-domain:snaptapp.us");
  });

  it("falls back to the first entry when snaptapp.us is absent", () => {
    expect(pickPreferredEntry(["https://example.com/", "https://other.example/"])).toBe(
      "https://example.com/",
    );
  });

  it("returns undefined for an empty list", () => {
    expect(pickPreferredEntry([])).toBeUndefined();
  });
});
