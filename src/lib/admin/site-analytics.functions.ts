import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./middleware";

export const fetchSearchConsole = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { fetchSearchConsoleStatus } = await import("./site-analytics.server");
    return fetchSearchConsoleStatus();
  });
