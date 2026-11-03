/**
 * Site search status via the linked Google Search Console connection.
 * Read-only: every call goes through the Lovable connector gateway with the
 * project's linked connection key, never to Google directly.
 *
 * The linked Google Analytics connection is the browser-tracking
 * (measurement ID) kind, which can only send events — reading GA4 reports
 * needs the OAuth "Read analytics insights" connection, so there is no
 * traffic-report fetch here.
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
  connectionKey: string | undefined,
): Promise<unknown> {
  const response = await fetch(`${GATEWAY}${path}`, {
    method: "GET",
    headers: gatewayHeaders(connectionKey),
  });
  if (!response.ok) {
    const snippet = (await response.text()).slice(0, 300);
    throw new Error(`Google request failed [${response.status}]: ${snippet}`);
  }
  return response.json();
}

/** Prefer the snaptapp.us site; fall back to the first entry. */
export function pickPreferredEntry(entries: string[]): string | undefined {
  return entries.find((entry) => entry.includes("snaptapp.us")) ?? entries[0];
}

export interface SearchConsoleStatus {
  sites: string[];
  matchedSite?: string;
  sitemaps: { path: string; lastSubmitted?: string; errors: number; warnings: number }[];
}

/** Verified sites and sitemap status from the linked Search Console account. */
export async function fetchSearchConsoleStatus(): Promise<SearchConsoleStatus> {
  const key = process.env["GOOGLE_SEARCH_CONSOLE_API_KEY"];
  const list = (await gatewayFetch("/google_search_console/webmasters/v3/sites", key)) as {
    siteEntry?: { siteUrl?: string }[];
  };
  const sites = (list.siteEntry ?? []).map((entry) => entry.siteUrl ?? "").filter(Boolean);
  const matchedSite = pickPreferredEntry(sites);
  let sitemaps: SearchConsoleStatus["sitemaps"] = [];
  if (matchedSite) {
    const result = (await gatewayFetch(
      `/google_search_console/webmasters/v3/sites/${encodeURIComponent(matchedSite)}/sitemaps`,
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
