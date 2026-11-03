import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "./middleware";

export const fetchSiteTraffic = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { fetchGaSiteTraffic } = await import("./site-analytics.server");
    return fetchGaSiteTraffic();
  });

export const fetchSearchConsole = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const { fetchSearchConsoleStatus } = await import("./site-analytics.server");
    return fetchSearchConsoleStatus();
  });
