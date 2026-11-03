/**
 * Site analytics via the linked Google Analytics and Google Search Console
 * connections. Read-only: every call goes through the Lovable connector
 * gateway with the project's linked connection keys, never to Google directly.
 */

const GATEWAY = "https://connector-gateway.lovable.dev";

function gatewayHeaders(connectionKey: string | undefined): Record<string, string> {
  const lovableKey = process.env["LOVABLE_API_KEY"]?.trim();
  if (!lovableKey || !connectionKey?.trim()) {
    throw new Error("This connector is not linked to the project yet.");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey.trim(),
    "Content-Type": "application/json",
  };
}

async function gatewayFetch(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  connectionKey: string | undefined,
): Promise<unknown> {
  const response = await fetch(`${GATEWAY}${path}`, {
    method: init.method,
    headers: gatewayHeaders(connectionKey),
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    const snippet = (await response.text()).slice(0, 300);
    throw new Error(`Google request failed [${response.status}]: ${snippet}`);
  }
  return response.json();
}

/** "20261103" -> "11/3" for compact chart labels. */
export function formatGaDate(raw: string): string {
  if (!/^\d{8}$/.test(raw)) return raw;
  return `${Number(raw.slice(4, 6))}/${Number(raw.slice(6, 8))}`;
}

/** Prefer the snaptapp.us property/site; fall back to the first entry. */
export function pickPreferredEntry(entries: string[]): string | undefined {
  return entries.find((entry) => entry.includes("snaptapp.us")) ?? entries[0];
}

export interface GaSiteTraffic {
  property: string;
  totalSessions: number;
  days: { date: string; users: number; sessions: number }[];
}

/** Last 28 days of site traffic from the first GA4 property on the account. */
export async function fetchGaSiteTraffic(): Promise<GaSiteTraffic> {
  const key = process.env["GOOGLE_ANALYTICS_API_KEY"];
  const accounts = (await gatewayFetch("/google_analytics/admin/v1beta/accountSummaries", { method: "GET" }, key)) as {
    accountSummaries?: { propertySummaries?: { property?: string; displayName?: string }[] }[];
  };
  const property = accounts.accountSummaries?.flatMap((a) => a.propertySummaries ?? [])[0];
  if (!property?.property) {
    throw new Error("No Google Analytics properties found on the connected Google account.");
  }
  const report = (await gatewayFetch(
    `/google_analytics/v1beta/${property.property}:runReport`,
    {
      method: "POST",
      body: {
        dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      },
    },
    key,
  )) as { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] };
  const days = (report.rows ?? []).map((row) => ({
    date: formatGaDate(row.dimensionValues[0]?.value ?? ""),
    users: Number(row.metricValues[0]?.value ?? 0),
    sessions: Number(row.metricValues[1]?.value ?? 0),
  }));
  return {
    property: property.displayName ?? property.property,
    totalSessions: days.reduce((sum, day) => sum + day.sessions, 0),
    days,
  };
}

export interface SearchConsoleStatus {
  sites: string[];
  matchedSite?: string;
  sitemaps: { path: string; lastSubmitted?: string; errors: number; warnings: number }[];
}

/** Verified sites and sitemap status from the linked Search Console account. */
export async function fetchSearchConsoleStatus(): Promise<SearchConsoleStatus> {
  const key = process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"];
  const list = (await gatewayFetch("/google_search_console/webmasters/v3/sites", { method: "GET" }, key)) as {
    siteEntry?: { siteUrl?: string }[];
  };
  const sites = (list.siteEntry ?? []).map((entry) => entry.siteUrl ?? "").filter(Boolean);
  const matchedSite = pickPreferredEntry(sites);
  let sitemaps: SearchConsoleStatus["sitemaps"] = [];
  if (matchedSite) {
    const result = (await gatewayFetch(
      `/google_search_console/webmasters/v3/sites/${encodeURIComponent(matchedSite)}/sitemaps`,
      { method: "GET" },
      key,
    )) as { sitemap?: { path?: string; lastSubmitted?: string; errors?: string; warnings?: string }[] };
    sitemaps = (result.sitemap ?? []).map((sitemap) => ({
      path: sitemap.path ?? "",
      lastSubmitted: sitemap.lastSubmitted,
      errors: Number(sitemap.errors ?? 0),
      warnings: Number(sitemap.warnings ?? 0),
    }));
  }
  return { sites, matchedSite, sitemaps };
}
