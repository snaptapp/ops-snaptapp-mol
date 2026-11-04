import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireMcpAdmin } from "../access";

export default defineTool({
  name: "list_pending_reports", title: "List pending reports",
  description: "Read up to 50 pending disputes and linked fact evidence with current snapshot tokens, excluding player identities and feedback.",
  inputSchema: { limit: z.number().int().min(1).max(50).default(50), offset: z.number().int().min(0).max(100000).default(0) },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, offset }, ctx) => {
    await requireMcpAdmin(ctx);
    const { pendingReports } = await import("../reports.server");
    const result = await pendingReports(limit, offset);
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});