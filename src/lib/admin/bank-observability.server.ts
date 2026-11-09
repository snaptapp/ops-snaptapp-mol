/**
 * Deployed-versus-Firestore bank observability for the admin facts page.
 * Reads the public Game Worker bank-version stamp and degrades to an
 * explicit unknown state when it cannot be reached.
 */
import { z } from "zod";
import { countCollection } from "../firebase/firestore.server";
import { FACT_STATUSES, STATUS, type FactStatus } from "./content-shared.server";

const DEPLOYED_BANK_SCHEMA = z.object({
  bank_version: z.string().trim().min(1),
  fact_count: z.number().int().nonnegative(),
  ddm_version: z.string().trim().min(1),
});

const BANK_VERSION_TIMEOUT_MS = 5_000;

/** The only user-facing explanation of how Firestore state reaches players. */
export const HYDRATION_EXPLANATION =
  "Firestore changes go live only after export, hydration PR merge, and Worker deployment.";

/**
 * The comparison shown beside the deployed endpoint. It intentionally compares
 * source lifecycle state with the embedded serving bank; it is not a claim that
 * every active Firestore row is export-eligible (after-dark, flagged, duplicate,
 * or malformed rows are filtered by the export projection).
 */
export const EXPORTED_DELTA_DEFINITION =
  "Firestore active lifecycle count minus deployed fact_count; export filters can make the populations differ.";

type DeployedBankKnown = {
  readonly state: "known";
  readonly stale: false;
  readonly bankVersion: string;
  readonly factCount: number;
  readonly ddmVersion: string;
};

type DeployedBankUnknown = {
  readonly state: "unknown";
  readonly stale: true;
  readonly reason: string;
};

export type DeployedBank = DeployedBankKnown | DeployedBankUnknown;

export interface BankObservability {
  readonly checkedAt: string;
  readonly deployed: DeployedBank;
  readonly firestore: {
    readonly lifecycle: Readonly<Record<FactStatus, number>>;
    readonly total: number;
    readonly active: number;
  };
  /** Active Firestore rows minus embedded Worker facts; null when deployment is unknown. */
  readonly exportedDelta: number | null;
  readonly exportedDeltaDefinition: string;
}

export interface BankObservabilityDependencies {
  readonly fetch?: typeof fetch;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

function unknownDeployed(reason: string): DeployedBankUnknown {
  return { state: "unknown", stale: true, reason };
}

function workerUrl(env: Readonly<Record<string, string | undefined>>): URL | null {
  const raw = (env["GAME_WORKER_URL"] ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return new URL("/api/bank/version", url);
  } catch {
    return null;
  }
}

/** Read the public deployment stamp, degrading to an explicit unknown state. */
export async function fetchDeployedBank(
  deps: BankObservabilityDependencies = {},
): Promise<DeployedBank> {
  const url = workerUrl(deps.env ?? process.env);
  if (!url) return unknownDeployed("GAME_WORKER_URL is not configured with a valid HTTP(S) URL.");

  const request = deps.fetch ?? fetch;
  let response: Response;
  try {
    response = await request(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(BANK_VERSION_TIMEOUT_MS),
    });
  } catch {
    return unknownDeployed("The Game Worker bank-version endpoint could not be reached.");
  }

  if (!response.ok) {
    return unknownDeployed(`The Game Worker bank-version endpoint returned HTTP ${response.status}.`);
  }

  const parsed = DEPLOYED_BANK_SCHEMA.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return unknownDeployed("The Game Worker bank-version endpoint returned an invalid response.");
  }

  return {
    state: "known",
    stale: false,
    bankVersion: parsed.data.bank_version,
    factCount: parsed.data.fact_count,
    ddmVersion: parsed.data.ddm_version,
  };
}

function emptyLifecycle(): Record<FactStatus, number> {
  return Object.fromEntries(FACT_STATUSES.map((status) => [status, 0])) as Record<FactStatus, number>;
}

/** Build the deployed-versus-Firestore snapshot consumed by the facts page. */
export async function getBankObservability(
  deps: BankObservabilityDependencies = {},
): Promise<BankObservability> {
  const countsPromise = Promise.all(
    FACT_STATUSES.map(async (status) => ({
      status,
      count: await countCollection("fact_bank", [
        { field: "status", op: "EQUAL", value: status },
      ]),
    })),
  );
  const [deployed, counts] = await Promise.all([fetchDeployedBank(deps), countsPromise]);
  const lifecycle = emptyLifecycle();
  for (const row of counts) lifecycle[row.status] = row.count;
  const total = Object.values(lifecycle).reduce((sum, count) => sum + count, 0);
  const active = lifecycle[STATUS.active];

  return {
    checkedAt: new Date().toISOString(),
    deployed,
    firestore: { lifecycle, total, active },
    exportedDelta: deployed.state === "known" ? active - deployed.factCount : null,
    exportedDeltaDefinition: EXPORTED_DELTA_DEFINITION,
  };
}

