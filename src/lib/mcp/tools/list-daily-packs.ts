import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireMcpAdmin } from "../access";

export default defineTool({
  name: "list_daily_packs",
  title: "List daily challenge packs",
  description: "Read a bounded daily-pack summary list without player data or making changes.",
  inputSchema: { limit: z.number().int().min(1).max(30).default(10).describe("Maximum pack summaries to return, from 1 to 30.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    await requireMcpAdmin(ctx);
    const { listDailyPacks } = await import("@/lib/admin/ops.server");
    try {
      const packs = (await listDailyPacks(limit)).map(({ date, category, total_rounds, blitz_ready }) => ({ date, category, total_rounds, blitz_ready }));
      return { content: [{ type: "text", text: JSON.stringify({ packs }) }], structuredContent: { packs } };
    } catch { throw new ToolError("Daily pack summaries could not be loaded. No changes were made."); }
  },
});