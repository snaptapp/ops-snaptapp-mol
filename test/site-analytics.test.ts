import { describe, expect, it } from "vitest";
import { pickPreferredEntry } from "../src/lib/admin/site-analytics.server";

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
