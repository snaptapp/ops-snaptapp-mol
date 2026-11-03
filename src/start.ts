import { createStart, createMiddleware } from "@tanstack/react-start";
import { getCloudToken } from "./lib/admin/cloud-token";

/** Attach only the Cloud session; Firebase remains the data backend. */
const attachCloudAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = await getCloudToken();
  return next(token ? { headers: { Authorization: `Bearer ${token}` } } : {});
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachCloudAuth],
}));
