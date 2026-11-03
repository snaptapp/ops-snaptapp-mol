import { describe, expect, it } from "vitest";
import { oauthReturnPath } from "../src/lib/oauth-return-path";

describe("OAuth login return boundary", () => {
  it("preserves the authorization ID and fragment", () => {
    expect(oauthReturnPath("/.lovable/oauth/consent?authorization_id=abc#review")).toBe("/.lovable/oauth/consent?authorization_id=abc#review");
  });
  it.each(["//evil.test", "/\\evil.test", "https://evil.test", "/x\n", null])("rejects unsafe return path %s", (value) => {
    expect(oauthReturnPath(value)).toBe("/");
  });
});