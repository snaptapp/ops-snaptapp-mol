import { beforeEach, describe, expect, it, vi } from "vitest";

import { exportFacts, listFacts } from "@/lib/admin/content.server";
import { firestoreDouble } from "./setup";

vi.mock("@/lib/firebase/firestore.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firebase/firestore.server")>();
  const { firestoreDouble: double } = await import("./setup");
  return {
    ...actual,
    ...double().module,
    normalizeKey: actual.normalizeKey,
    factId: actual.factId,
  };
});

beforeEach(() => {
  firestoreDouble().reset();
});

function seedFacts(count: number, prefix = "fact", status = "active") {
  const entries: Record<string, Record<string, unknown>> = {};
  for (let index = 0; index < count; index += 1) {
    const id = `${prefix}_${String(index).padStart(5, "0")}`;
    entries[`fact_bank/${id}`] = {
      status,
      subject: `Subject ${id}`,
      angle: `Angle ${index}`,
      true_number: index,
      unit: "meters",
    };
  }
  firestoreDouble().seedMany(entries);
}

describe("fact listing and export scan completeness", () => {
  it("paginates matches beyond the first 1,000 server-side documents", async () => {
    seedFacts(1205);
    firestoreDouble().seed("fact_bank/pending_1", {
      status: "pending",
      subject: "Pending Subject",
      angle: "Pending Angle",
    });

    const firstPage = await listFacts({ status: "active", pageSize: 50, page: 1 });
    expect(firstPage.total).toBe(1205);
    expect(firstPage.windowed).toBe(false);
    expect(firstPage.facts).toHaveLength(50);
    expect(firstPage.facts[0]?.id).toBe("fact_00000");

    const lastPage = await listFacts({ status: "active", pageSize: 50, page: 25 });
    expect(lastPage.facts.map((fact) => fact.id)).toEqual([
      "fact_01200",
      "fact_01201",
      "fact_01202",
      "fact_01203",
      "fact_01204",
    ]);
  });

  it("applies in-memory filters to documents past the first scan batch", async () => {
    seedFacts(1205);
    firestoreDouble().seed("fact_bank/needle", {
      status: "active",
      subject: "Needle Subject",
      angle: "Needle Angle",
      question: "unique needle phrase",
    });

    const listed = await listFacts({ status: "active", search: "needle phrase", pageSize: 100 });
    expect(listed.total).toBe(1);
    expect(listed.facts.map((fact) => fact.id)).toEqual(["needle"]);

    const exported = await exportFacts({ status: "active", search: "needle phrase" });
    expect(exported.map((fact) => fact.id)).toEqual(["needle"]);
  });

  it("returns every match from exportFacts across scan batches", async () => {
    seedFacts(1205);
    const exported = await exportFacts({ status: "active" });
    expect(exported).toHaveLength(1205);
    expect(exported.at(-1)?.id).toBe("fact_01204");
  });

  it("does not report windowed when the match count lands exactly on the scan limit", async () => {
    seedFacts(10_000);
    const listed = await listFacts({ status: "active", pageSize: 50 });
    expect(listed.total).toBe(10_000);
    expect(listed.windowed).toBe(false);
  });

  it("bounds listFacts and fails exportFacts loudly beyond the scan limit", async () => {
    seedFacts(10_001);

    const listed = await listFacts({ status: "active", pageSize: 50 });
    expect(listed.total).toBe(10_000);
    expect(listed.windowed).toBe(true);

    await expect(exportFacts({ status: "active" })).rejects.toThrow(/scan limit/);
  });
});
