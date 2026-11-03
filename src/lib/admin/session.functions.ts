import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./middleware";

export const getAdminSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) => context.user);