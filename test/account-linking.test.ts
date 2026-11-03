import { describe, expect, it } from "vitest";
import { linkErrorMessage } from "../src/lib/account-linking";

describe("sign-in method link errors", () => {
  it("names the wrong email when a different account signs in", () => {
    const m = linkErrorMessage("different_account", "other@x.com", "Lovable", "me@snaptapp.us");
    expect(m).toContain("other@x.com");
    expect(m).toContain("me@snaptapp.us");
  });
  it("explains disabled disconnect without the raw code", () => {
    expect(linkErrorMessage("unlink", "Manual linking is disabled")).not.toContain("manual_linking");
  });
});
