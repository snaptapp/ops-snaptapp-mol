import { afterEach, describe, expect, it, vi } from "vitest";
import { reviewReportWithCopilot } from "@/lib/admin/report-copilot.server";

vi.mock("@/lib/firebase/credentials.server", () => ({
  getAccessToken: vi.fn(async () => "test-token"),
  getServiceAccount: vi.fn(() => ({ project_id: "credential-project" })),
}));

describe("copilot project configuration", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  async function requestUrl() {
    const request = vi.fn(async (_url: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ verdict: "unclear", confidence: "low", rationale: "Needs review", sources: [] }) }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    await reviewReportWithCopilot({ topic: "Test", claimStatement: "Test {n}", presentedNumber: 1, trueNumber: 2, unit: "", reason: "test", feedbackText: "" });
    return request.mock.calls[0]?.[0];
  }
  it("uses the existing Firebase credential project without extra project settings", async () => {
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", ""); vi.stubEnv("FIREBASE_PROJECT_ID", "");
    expect(await requestUrl()).toContain("/projects/credential-project/");
  });
  it("keeps an explicit Google project override", async () => {
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", " override-project ");
    expect(await requestUrl()).toContain("/projects/override-project/");
  });
  it("keeps a Firebase project override ahead of the credential fallback", async () => {
    vi.stubEnv("GOOGLE_CLOUD_PROJECT", " "); vi.stubEnv("FIREBASE_PROJECT_ID", " firebase-override ");
    expect(await requestUrl()).toContain("/projects/firebase-override/");
  });
});