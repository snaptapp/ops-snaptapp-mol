import { describe, expect, it } from "vitest";
import { linkErrorMessage, matchesSignInProvider } from "../src/lib/account-linking";

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

describe("connected sign-in identities", () => {
  it("recognizes the actual managed Lovable provider", () => {
    expect(matchesSignInProvider("custom:lovable", "lovable")).toBe(true);
    expect(matchesSignInProvider("lovable", "lovable")).toBe(true);
    expect(matchesSignInProvider("custom:other", "lovable")).toBe(false);
  });
  it("does not mistake a Lovable sign-in for a Google connection", () => {
    expect(matchesSignInProvider("custom:lovable", "google")).toBe(false);
    expect(matchesSignInProvider("google", "google")).toBe(true);
  });
  it("recognizes Microsoft aliases", () => {
    expect(matchesSignInProvider("azure", "microsoft")).toBe(true);
    expect(matchesSignInProvider("microsoft", "azure")).toBe(true);
  });
});
