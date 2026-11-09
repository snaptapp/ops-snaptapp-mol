import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runPredeploy(env: Record<string, string>) {
  const cleanEnv = { ...process.env };
  delete cleanEnv.SHARED_ARTIFACT_PAT;
  delete cleanEnv.GITHUB_TOKEN;
  delete cleanEnv.GH_TOKEN;
  return spawnSync(process.execPath, ["scripts/predeploy-freshness.mjs"], {
    cwd: root,
    env: { ...cleanEnv, ...env },
    encoding: "utf8",
  });
}

describe("predeploy freshness wrapper", () => {
  it("warns and passes when no upstream credentials are configured", () => {
    const result = runPredeploy({});
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("upstream freshness not verified");
  });

  it("treats empty credential values as absent", () => {
    const result = runPredeploy({
      SHARED_ARTIFACT_PAT: "",
      GITHUB_TOKEN: "",
      GH_TOKEN: "",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("upstream freshness not verified");
  });
});
