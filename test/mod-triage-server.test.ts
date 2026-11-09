import { beforeEach, describe, expect, it, vi } from "vitest";
import { firestoreDouble } from "./setup";
import { STATUS } from "@/lib/admin/content.server";

vi.mock("@/lib/firebase/firestore.server", async () => {
  const { firestoreDouble } = await import("./setup");
  return firestoreDouble().module;
});

const reviewReportWithCopilot = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin/report-copilot.server", () => ({
  reviewReportWithCopilot,
}));

import { runModQueueTriage } from "@/lib/admin/mod-triage.server";
import { moderationCopilot } from "@/lib/admin/ops-moderation.server";

const ACTOR = { uid: "admin-1", email: "admin@example.com", name: "Admin", isClaimAdmin: true };

const AUTO_REVIEW = {
  verdict: "fix_number",
  confidence: "high",
  rationale: "Two independent primary sources agree on the corrected number.",
  suggested: { true_number: 65, note: "Corrected to 65" },
  sources: [
    {
      url: "https://usgs.gov/example",
      title: "USGS record",
      excerpts: ["The value is 65."],
      stance: "supports",
      conflicting: false,
    },
    {
      url: "https://noaa.gov/example",
      title: "NOAA record",
      excerpts: ["Measured 65."],
      stance: "supports",
      conflicting: false,
    },
  ],
  policy: {
    needsReview: false,
    reasons: [],
    modelConfidence: "high",
    score: 90,
    factors: [],
    uncalibrated: true,
  },
  model: "test-model",
};

function seedBoundReport() {
  firestoreDouble().seedMany({
    "fact_bank/f1": {
      status: STATUS.active,
      subject: "Seeded",
      subject_key: "seeded",
      angle: "Reveal",
      angle_key: "reveal",
      true_number: 70,
      unit: "mph",
      claim_template: "Seeded claim {n}",
    },
    "trivia_reports/r1": {
      status: "pending_review",
      topic: "Seeded",
      claimStatement: "Seeded claim 70",
      factId: "f1",
      trueNumber: 70,
      presentedNumber: 60,
      unit: "mph",
      reason: "number looks wrong",
      feedbackText: "",
      createdAt: "2026-10-01T00:00:00.000Z",
    },
  });
}

function resolutionAudits() {
  return firestoreDouble()
    .documents()
    .filter(
      (doc) =>
        doc.path.startsWith("admin_audit_logs/") &&
        typeof doc.data["action"] === "string" &&
        (doc.data["action"] as string).startsWith("report.") &&
        doc.data["action"] !== "report.copilot_review",
    );
}

describe("mod queue triage revision propagation", () => {
  beforeEach(() => {
    reviewReportWithCopilot.mockReset();
    firestoreDouble().reset();
  });

  it("aborts auto-resolution when the reviewed fact drifts during the copilot await", async () => {
    seedBoundReport();
    reviewReportWithCopilot.mockImplementation(async () => {
      // A concurrent unit-only edit lands while the grounded review is awaited.
      await firestoreDouble().module.patchDoc("fact_bank/f1", { unit: "km/h" });
      return AUTO_REVIEW;
    });

    const result = await runModQueueTriage({ dryRun: false, actor: ACTOR });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.outcome).toBe("error");
    expect(result.items[0]?.reason).toContain("Fact changed since review");
    expect(result.autoResolved).toBe(0);
    expect(result.errors).toBe(1);

    const fact = firestoreDouble().document("fact_bank/f1")!;
    expect(fact.data["unit"]).toBe("km/h");
    expect(fact.data["true_number"]).toBe(70);
    expect(fact.data["status"]).toBe(STATUS.active);
    expect(firestoreDouble().document("trivia_reports/r1")!.data["status"]).toBe("pending_review");
    expect(resolutionAudits()).toHaveLength(0);
  });

  it("resolves automatically when every reviewed revision still matches", async () => {
    seedBoundReport();
    reviewReportWithCopilot.mockResolvedValue(AUTO_REVIEW);

    const result = await runModQueueTriage({ dryRun: false, actor: ACTOR });

    expect(result.items[0]?.outcome).toBe("auto_resolved");
    expect(result.autoResolved).toBe(1);
    const fact = firestoreDouble().document("fact_bank/f1")!;
    expect(fact.data["true_number"]).toBe(65);
    expect(fact.data["unit"]).toBe("mph");
    expect(firestoreDouble().document("trivia_reports/r1")!.data["status"]).toBe("resolved");
    expect(resolutionAudits().length).toBeGreaterThan(0);
  });

  it("exposes the original fact and duplicate revisions from moderationCopilot", async () => {
    seedBoundReport();
    firestoreDouble().seed("fact_bank/f_dup", {
      status: STATUS.active,
      subject: "Seeded",
      subject_key: "seeded",
      angle: "Alt",
      angle_key: "alt",
      true_number: 71,
      unit: "mph",
      claim_template: "Seeded claim {n}",
    });
    await firestoreDouble().module.patchDoc("trivia_reports/r1", {
      duplicateFactIds: ["f_dup"],
      qualityFlags: ["duplicate_question"],
    });
    const dupRev = firestoreDouble().document("fact_bank/f_dup")!.updateTime;
    const factRev = firestoreDouble().document("fact_bank/f1")!.updateTime;
    reviewReportWithCopilot.mockResolvedValue({
      ...AUTO_REVIEW,
      verdict: "unclear",
      confidence: "low",
      suggested: {},
      sources: [],
      policy: { ...AUTO_REVIEW.policy, needsReview: true, score: 10 },
    });

    const result = await moderationCopilot("r1", ACTOR);

    expect(result.expectedFacts).toEqual(
      expect.arrayContaining([
        { id: "f1", updateTime: factRev },
        { id: "f_dup", updateTime: dupRev },
      ]),
    );
    expect(result.expectedFacts).toHaveLength(2);
  });
});
