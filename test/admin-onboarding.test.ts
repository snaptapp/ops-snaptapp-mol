import { describe, expect, it, vi } from "vitest";
import { onboardAdmin } from "../src/lib/admin/admin-onboarding";

function operations(existing: string | null = null) {
  return { find: vi.fn(async () => existing), create: vi.fn(async () => "new-admin"), grant: vi.fn(async () => {}), audit: vi.fn(async () => {}) };
}
describe("admin onboarding", () => {
  it("creates and grants admin access to a new email", async () => {
    const ops = operations();
    expect(await onboardAdmin(" New@snaptapp.us ", ops)).toEqual({ uid: "new-admin", email: "new@snaptapp.us", created: true });
    expect(ops.create).toHaveBeenCalledWith("new@snaptapp.us");
    expect(ops.grant).toHaveBeenCalledWith("new-admin");
    expect(ops.audit).toHaveBeenCalledWith("new-admin");
  });
  it("grants an existing Lovable account without creating a duplicate", async () => {
    const ops = operations("lovable-admin");
    await onboardAdmin("member@hotmail.com", ops);
    expect(ops.create).not.toHaveBeenCalled();
    expect(ops.grant).toHaveBeenCalledWith("lovable-admin");
  });
  it("does not grant access if account creation fails", async () => {
    const ops = operations();
    ops.create.mockRejectedValue(new Error("creation failed"));
    await expect(onboardAdmin("new@snaptapp.us", ops)).rejects.toThrow("creation failed");
    expect(ops.grant).not.toHaveBeenCalled();
  });
  it("rejects an invalid admin email before any writes", async () => {
    const ops = operations();
    await expect(onboardAdmin("not-an-email", ops)).rejects.toThrow();
    expect(ops.create).not.toHaveBeenCalled();
    expect(ops.grant).not.toHaveBeenCalled();
  });
});