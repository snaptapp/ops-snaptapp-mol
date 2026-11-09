import { afterEach, describe, expect, it, vi } from "vitest";

import { runQuery, runQueryPage } from "@/lib/firebase/firestore.server";

vi.mock("@/lib/firebase/credentials.server", () => ({
  getAccessToken: async () => "test-access-token",
  getServiceAccount: () => ({
    project_id: "test-project",
    client_email: "test@test-project.iam.gserviceaccount.com",
    private_key: "unused",
  }),
}));

function firestoreRow(name: string, fields: Record<string, unknown> = {}) {
  const encoded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    encoded[key] = typeof value === "number" ? { integerValue: String(value) } : { stringValue: String(value) };
  }
  return {
    document: {
      name: `projects/test-project/databases/(default)/documents/${name}`,
      fields: encoded,
      updateTime: "2024-01-01T00:00:00.000000Z",
    },
  };
}

function stubRunQueryResponse(rows: unknown[]) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(rows), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function requestBody(fetchMock: ReturnType<typeof stubRunQueryResponse>): Record<string, unknown> {
  const call = fetchMock.mock.calls[0];
  expect(call).toBeDefined();
  const init = call?.[1];
  return JSON.parse(String(init?.body ?? "")) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runQueryPage wire format", () => {
  it("sends __name__ orderBy encoding and no readTime when unpinned", async () => {
    const fetchMock = stubRunQueryResponse([
      firestoreRow("fact_bank/f1", { status: "active" }),
      { readTime: "2024-06-01T00:00:00.000000Z" },
    ]);

    const page = await runQueryPage({
      collection: "fact_bank",
      filters: [{ field: "status", op: "EQUAL", value: "active" }],
      orderBy: { field: "__name__", direction: "ASCENDING" },
      limit: 1000,
      offset: 0,
    });

    const body = requestBody(fetchMock);
    expect(body["readTime"]).toBeUndefined();
    expect("readTime" in body).toBe(false);
    const structuredQuery = body["structuredQuery"] as Record<string, unknown>;
    expect(structuredQuery["orderBy"]).toEqual([
      { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
    ]);
    expect((structuredQuery["where"] as Record<string, unknown>)["fieldFilter"]).toBeDefined();

    expect(page.docs).toHaveLength(1);
    expect(page.docs[0]?.id).toBe("f1");
    expect(page.docs[0]?.data["status"]).toBe("active");
    expect(page.readTime).toBe("2024-06-01T00:00:00.000000Z");
  });

  it("sends the pinned readTime at request top level and accepts a matching snapshot", async () => {
    const fetchMock = stubRunQueryResponse([
      firestoreRow("fact_bank/f2"),
      { readTime: "2024-06-01T00:00:00.000000Z" },
    ]);

    const page = await runQueryPage({
      collection: "fact_bank",
      orderBy: { field: "__name__", direction: "ASCENDING" },
      limit: 1,
      offset: 1000,
      readTime: "2024-06-01T00:00:00.000000Z",
    });

    const body = requestBody(fetchMock);
    expect(body["readTime"]).toBe("2024-06-01T00:00:00.000000Z");
    expect(page.readTime).toBe("2024-06-01T00:00:00.000000Z");
    expect(page.docs).toHaveLength(1);
  });

  it("fails closed when the server returns a different readTime than the pin", async () => {
    stubRunQueryResponse([
      firestoreRow("fact_bank/f3"),
      { readTime: "2024-06-02T00:00:00.000000Z" },
    ]);

    await expect(
      runQueryPage({
        collection: "fact_bank",
        orderBy: { field: "__name__", direction: "ASCENDING" },
        limit: 1,
        readTime: "2024-06-01T00:00:00.000000Z",
      }),
    ).rejects.toThrow(/readTime/i);
  });

  it("handles a metadata-only empty response", async () => {
    stubRunQueryResponse([{ readTime: "2024-06-03T00:00:00.000000Z" }]);

    const page = await runQueryPage({
      collection: "fact_bank",
      orderBy: { field: "__name__", direction: "ASCENDING" },
      limit: 1,
      offset: 5000,
      readTime: "2024-06-03T00:00:00.000000Z",
    });

    expect(page.docs).toEqual([]);
    expect(page.readTime).toBe("2024-06-03T00:00:00.000000Z");
  });

  it("returns the last non-empty readTime across interleaved response rows", async () => {
    stubRunQueryResponse([
      firestoreRow("fact_bank/f5"),
      { readTime: "2024-06-05T00:00:00.000000Z" },
      firestoreRow("fact_bank/f6"),
      { readTime: "2024-06-05T00:00:01.000000Z" },
      { readTime: "2024-06-05T00:00:02.000000Z" },
    ]);

    const page = await runQueryPage({
      collection: "fact_bank",
      orderBy: { field: "__name__", direction: "ASCENDING" },
      limit: 2,
    });

    expect(page.docs.map((doc) => doc.id)).toEqual(["f5", "f6"]);
    expect(page.readTime).toBe("2024-06-05T00:00:02.000000Z");
  });

  it("runQuery stays a docs-only compatibility wrapper", async () => {
    const fetchMock = stubRunQueryResponse([
      firestoreRow("fact_bank/f4"),
      { readTime: "2024-06-04T00:00:00.000000Z" },
    ]);

    const docs = await runQuery({ collection: "fact_bank", limit: 5 });

    expect(docs).toHaveLength(1);
    expect(docs[0]?.id).toBe("f4");
    const body = requestBody(fetchMock);
    expect("readTime" in body).toBe(false);
  });
});
