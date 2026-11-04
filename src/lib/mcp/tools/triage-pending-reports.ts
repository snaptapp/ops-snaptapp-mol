import { defineTool } from "@lovable.dev/mcp-js";
import { requireMcpAdmin } from "../access";
import { triageInputSchema } from "../triage-schema";

export default defineTool({
  name: "triage_pending_reports", title: "Triage and resolve pending reports",
  description: "Validate up to 50 externally sourced reviews; dry-run by default, apply only explicitly confirmed high-confidence non-conflicting allowed resolutions and audit the admin caller.",
  inputSchema: triageInputSchema,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ reviews, dryRun, confirmApply }, ctx) => {
    const { user } = await requireMcpAdmin(ctx);
    const { triageExternalReviews } = await import("../reports.server");
    const result = await triageExternalReviews(reviews, dryRun, confirmApply, user, {
      signal: ctx.signal,
      progress: async (completed) => { await ctx.progress({ progress: completed, total: reviews.length, message: "Reviewed moderation evidence" }); },
    });
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
  },
});