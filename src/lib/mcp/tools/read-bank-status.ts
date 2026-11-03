import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { requireMcpAdmin } from "../access";

export default defineTool({
  name: "read_fact_bank_status",
  title: "Read fact bank status",
  description: "Read lifecycle counts and deployed-bank freshness without exposing player records or changing facts.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async (_args, ctx) => {
    await requireMcpAdmin(ctx);
    const { getBankObservability } = await import("@/lib/admin/content.server");
    try {
      const snapshot = await getBankObservability();
      const status = {
        checkedAt: snapshot.checkedAt,
        lifecycle: { ...snapshot.firestore.lifecycle },
        total: snapshot.firestore.total,
        active: snapshot.firestore.active,
        deployed: snapshot.deployed.state === "known" ? {
          state: snapshot.deployed.state, bankVersion: snapshot.deployed.bankVersion,
          factCount: snapshot.deployed.factCount, ddmVersion: snapshot.deployed.ddmVersion,
        } : { state: "unknown" },
        exportedDelta: snapshot.exportedDelta,
        exportedDeltaDefinition: snapshot.exportedDeltaDefinition,
      };
      return { content: [{ type: "text", text: JSON.stringify(status) }], structuredContent: { status } };
    } catch { throw new ToolError("Fact bank status could not be loaded. No changes were made."); }
  },
});