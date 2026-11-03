import { createMiddleware, createServerFn } from "@tanstack/react-start";

export const authMiddleware = createMiddleware({ type: "function" })
  .server(async ({ next }) => {
    const { requireCloudAdmin } = await import("./cloud-auth.server");
    const { user, client } = await requireCloudAdmin();
    return next({
      context: { user, cloud: client },
    });
  });

export function authedServerFn(options?: Parameters<typeof createServerFn>[0]) {
  return createServerFn(options).middleware([authMiddleware]);
}

