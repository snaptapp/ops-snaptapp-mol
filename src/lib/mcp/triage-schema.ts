import { z } from "zod";
import { AUTO_TRIAGE_BATCH_LIMIT } from "@/lib/admin/mod-triage";

const source = z.object({
  url: z.string().url().max(500).refine((value) => new URL(value).protocol === "https:", "Use an HTTPS source."),
  title: z.string().min(1).max(200),
  excerpts: z.array(z.string().trim().min(1).max(800)).min(1).max(3),
  value: z.number().finite(),
  unit: z.string().min(1).max(60),
  period: z.string().max(60).optional(),
  stance: z.enum(["supports", "contradicts", "unclear"]),
}).strict();

export const externalReviewSchema = z.object({
  reportId: z.string().min(1).max(200).regex(/^[^/]+$/),
  expectedSnapshot: z.string().regex(/^[a-f0-9]{64}$/),
  verdict: z.enum(["uphold_fact", "fix_number", "retire_fact", "resolve_as_is", "reject", "unclear"]),
  confidence: z.enum(["low", "medium", "high"]),
  correctedNumber: z.number().finite().optional(),
  rationale: z.string().trim().min(1).max(1200),
  sources: z.array(source).max(8),
}).strict();

export const triageInputSchema = {
  reviews: z.array(externalReviewSchema).min(1).max(AUTO_TRIAGE_BATCH_LIMIT).describe("Sourced reviews produced by your own assistant/web search; up to 50. Fetch current snapshots first."),
  dryRun: z.boolean().default(true).describe("Defaults to true: validate only, without writes."),
  confirmApply: z.boolean().default(false).describe("Must be true with dryRun=false after the user explicitly authorizes applying eligible resolutions."),
};

export type ExternalReview = z.infer<typeof externalReviewSchema>;