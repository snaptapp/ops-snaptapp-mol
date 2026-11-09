import { beforeEach, describe, expect, it, vi } from "vitest";

import { exportFacts, listFacts } from "@/lib/admin/content.server";
import { firestoreDouble } from "./setup";
import type { FirestoreDoc } from "@/lib/firebase/firestore.server";

interface ScanPage {
  docs: FirestoreDoc[];
  readTime?: string;
}

const scanHarness = vi.hoisted(() => ({
  /** fact_bank scan requests seen so far; reset before each test. */
  scanCalls: 0,
  /** How many times beforeSecondScan actually fired. */
  hookFired: 0,
  /** Invoked once before the second fact_bank scan request of each test. */
  beforeSecondScan: null as null | (() => void | Promise<void>),
  /** When set, runQueryPage responses are replaced by this mapping. */
  mapPage: null as null | ((page: ScanPage) => ScanPage),
}));

vi.mock("@/lib/firebase/firestore.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firebase/firestore.server")>();
  const { firestoreDouble: double } = await import("./setup");
  const instance = double();
  const beforeScanCall = async (collection: string) => {
    if (collection !== "fact_bank") return;
    scanHarness.scanCalls += 1;
    if (scanHarness.scanCalls === 2 && scanHarness.beforeSecondScan) {
      scanHarness.hookFired += 1;
      await scanHarness.beforeSecondScan();
    }
  };
  const realRunQueryPage = instance.module.runQueryPage;
  return {
    ...actual,
    ...instance.module,
    normalizeKey: actual.normalizeKey,
    factId: actual.factId,
    runQuery: (async (options: { collection: string }) => {
      await beforeScanCall(options.collection);
      return instance.module.runQuery(options as never);
    }) as never,
    ...(realRunQueryPage
      ? {
          runQueryPage: (async (options: { collection: string }) => {
            await beforeScanCall(options.collection);
            const page = (await realRunQueryPage(options as never)) as ScanPage;
            return scanHarness.mapPage ? scanHarness.mapPage(page) : page;
          }) as never,
        }
      : {}),
  };
});

beforeEach(() => {
  firestoreDouble().reset();
  scanHarness.scanCalls = 0;
  scanHarness.hookFired = 0;
  scanHarness.beforeSecondScan = null;
  scanHarness.mapPage = null;
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

function expectedIds(count: number): Set<string> {
  const ids = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    ids.add(`fact_${String(index).padStart(5, "0")}`);
  }
  return ids;
}

function factBankQueryReads() {
  return firestoreDouble()
    .reads()
    .filter((read) => read.kind === "query" && read.target === "fact_bank");
}

describe("collectFactScan snapshot consistency", () => {
  it("returns the original snapshot exactly once when writes land between batch reads", async () => {
    seedFacts(1205);
    scanHarness.beforeSecondScan = async () => {
      // Concurrent writes between the first and second page reads: one insert
      // sorting before the first batch and one status change inside it.
      await firestoreDouble().module.createDoc("fact_bank", "aaa_new", {
        status: "active",
        subject: "Concurrent Subject",
        angle: "Concurrent Angle",
        true_number: 1,
        unit: "meters",
      });
      await firestoreDouble().module.patchDoc("fact_bank/fact_01100", { status: "retired" });
    };

    const exported = await exportFacts({ status: "active" });

    expect(exported).toHaveLength(1205);
    const ids = exported.map((fact) => fact.id);
    expect(new Set(ids).size).toBe(1205);
    expect(new Set(ids)).toEqual(expectedIds(1205));
    expect(ids).not.toContain("aaa_new");
    // The snapshot predates the concurrent status change, so the fact is
    // still returned exactly once.
    expect(ids.filter((id) => id === "fact_01100")).toHaveLength(1);
    expect(scanHarness.hookFired).toBe(1);

    const reads = factBankQueryReads();
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads[0]?.readTime).toBeUndefined();
    const pinned = reads.slice(1).map((read) => read.readTime);
    expect(pinned.every((readTime) => typeof readTime === "string" && readTime.length > 0)).toBe(true);
    expect(new Set(pinned).size).toBe(1);
  });

  it("returns the original snapshot when a fact inside the first batch is deleted mid-scan", async () => {
    seedFacts(1205);
    scanHarness.beforeSecondScan = async () => {
      await firestoreDouble().module.deleteDoc("fact_bank/fact_00010");
    };

    const exported = await exportFacts({ status: "active" });

    expect(scanHarness.hookFired).toBe(1);
    expect(exported).toHaveLength(1205);
    const ids = exported.map((fact) => fact.id);
    expect(new Set(ids).size).toBe(1205);
    expect(new Set(ids)).toEqual(expectedIds(1205));
    expect(ids.filter((id) => id === "fact_00010")).toHaveLength(1);
  });

  it("returns the original snapshot when a fact inside the first batch changes status mid-scan", async () => {
    seedFacts(1205);
    scanHarness.beforeSecondScan = async () => {
      await firestoreDouble().module.patchDoc("fact_bank/fact_00010", { status: "retired" });
    };

    const exported = await exportFacts({ status: "active" });

    expect(scanHarness.hookFired).toBe(1);
    expect(exported).toHaveLength(1205);
    const ids = exported.map((fact) => fact.id);
    expect(new Set(ids).size).toBe(1205);
    expect(new Set(ids)).toEqual(expectedIds(1205));
    expect(ids.filter((id) => id === "fact_00010")).toHaveLength(1);
  });

  it("pins one snapshot readTime across every continuation and the cap probe", async () => {
    seedFacts(10_000);

    const listed = await listFacts({ status: "active", pageSize: 50 });

    expect(listed.total).toBe(10_000);
    expect(listed.windowed).toBe(false);
    const reads = factBankQueryReads();
    // 10 full batches plus the exact-cap probe.
    expect(reads).toHaveLength(11);
    expect(reads[0]?.readTime).toBeUndefined();
    const pinned = new Set(reads.slice(1).map((read) => read.readTime));
    expect(pinned.size).toBe(1);
    const [only] = [...pinned];
    expect(typeof only).toBe("string");
    expect((only as string).length).toBeGreaterThan(0);
  });

  it("throws a clear incomplete-snapshot error when a full first page has no readTime", async () => {
    seedFacts(1205);
    scanHarness.mapPage = (page) => ({ docs: page.docs });

    const scan = exportFacts({ status: "active" });
    await expect(scan).rejects.toThrow(/snapshot/i);
    await expect(scan).rejects.toThrow(/readTime/i);

    // The scan must not continue with unpinned follow-up reads.
    expect(factBankQueryReads()).toHaveLength(1);
  });
});
