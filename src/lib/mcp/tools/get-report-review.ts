import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireMcpAdmin } from "../access";

export default defineTool({
  name: "get_report_review_context", title: "Get report review context",
  description: "Read a current pending report, linked facts, source URLs, allowed actions and snapshot token for your own web-grounded review; no model call or writes.",
  inputSchema: { reportId: z.string().min(1).max(200).regex(/^[^/]+$/) },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ reportId }, ctx) => {
    await requireMcpAdmin(ctx);
    const { loadPendingItem } = await import("@/lib/admin/ops-moderation.server");
    const { projectReport } = await import("../reports.server");
    const result = await projectReport(await loadPendingItem(reportId));
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});