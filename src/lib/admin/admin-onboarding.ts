import { z } from "zod";

export const adminEmailSchema = z.string().trim().toLowerCase().email().max(254);

export async function onboardAdmin(
  email: string,
  operations: {
    find: (email: string) => Promise<string | null>;
    create: (email: string) => Promise<string>;
    grant: (uid: string) => Promise<void>;
    audit: (uid: string) => Promise<void>;
  },
) {
  const normalized = adminEmailSchema.parse(email);
  const existing = await operations.find(normalized);
  const uid = existing ?? await operations.create(normalized);
  await operations.grant(uid);
  await operations.audit(uid);
  return { uid, email: normalized, created: existing === null };
}