import { describe, expect, it } from "vitest";
import { authorizeCloudAdmin } from "../src/lib/admin/cloud-auth.server";

const confirmed = { id: "cloud-admin", email: "michael@snaptapp.us", email_confirmed_at: "2026-11-03" };

describe("Cloud portal admin boundary", () => {
  it("opens the portal for a verified Cloud admin without Firebase auth", async () => {
    const user = await authorizeCloudAdmin("cloud-token", async () => confirmed, async (id) => id === "cloud-admin");
    expect(user.uid).toBe("cloud-admin");
    expect(user.email).toBe("michael@snaptapp.us");
  });
  it("rejects signed-in accounts without a protected admin role with 401", async () => {
    await expect(authorizeCloudAdmin("token", async () => confirmed, async () => false)).rejects.toMatchObject({ status: 401 });
  });
  it("accepts the approved Lovable account outside snaptapp.us with a protected role", async () => {
    const account = { id: "653af8d3-6af0-4ad0-8e0c-c0c4984e86e4", email: "tonythethompson@hotmail.com", email_confirmed_at: "2026-11-03" };
    const user = await authorizeCloudAdmin("lovable-token", async () => account, async (id) => id === account.id);
    expect(user.email).toBe("tonythethompson@hotmail.com");
  });
  it("does not grant other Lovable accounts access without an approved role", async () => {
    await expect(authorizeCloudAdmin("lovable-token", async () => ({ ...confirmed, email: "other@example.com" }), async () => false)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects missing tokens before consulting identity or roles", async () => {
    await expect(authorizeCloudAdmin("", async () => confirmed, async () => true)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects invalid sessions even if a role check would grant access", async () => {
    await expect(authorizeCloudAdmin("invalid", async () => null, async () => true)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects an unconfirmed initial admin email", async () => {
    await expect(authorizeCloudAdmin("token", async () => ({ id: confirmed.id, email: confirmed.email }), async () => true)).rejects.toMatchObject({ status: 401 });
  });
  it("fails closed on unavailable role storage", async () => {
    await expect(authorizeCloudAdmin("token", async () => confirmed, async () => { throw new Error("unavailable"); })).rejects.toThrow("unavailable");
  });
});
