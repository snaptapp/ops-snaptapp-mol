import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRAPPER = path.join(root, "scripts", "predeploy-freshness.mjs");

const fixtureDirs: string[] = [];

function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.SHARED_ARTIFACT_PAT;
  delete env.GITHUB_TOKEN;
  delete env.GH_TOKEN;
  delete env.STUB_EXIT_CODE;
  delete env.STUB_MARKER;
  return { ...env, ...extra };
}

function runWrapper(scriptPath: string, env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [scriptPath], { env, encoding: "utf8" });
}

/**
 * Copies the real wrapper into a temp fixture `scripts/` directory next to a
 * stub `check-artifact-freshness.mjs` that never touches the network. The stub
 * records invocation in a marker file and exits with STUB_EXIT_CODE.
 */
function makeFixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "predeploy-freshness-"));
  fixtureDirs.push(dir);
  mkdirSync(path.join(dir, "scripts"), { recursive: true });
  writeFileSync(
    path.join(dir, "scripts", "predeploy-freshness.mjs"),
    readFileSync(WRAPPER, "utf8"),
  );
  writeFileSync(
    path.join(dir, "scripts", "check-artifact-freshness.mjs"),
    [
      'import { writeFileSync } from "node:fs";',
      'import path from "node:path";',
      'import { fileURLToPath } from "node:url";',
      'const here = path.dirname(fileURLToPath(import.meta.url));',
      'writeFileSync(path.join(here, "stub-invoked.txt"), process.env.STUB_MARKER ?? "yes");',
      'process.exit(Number(process.env.STUB_EXIT_CODE ?? "0"));',
      "",
    ].join("\n"),
  );
  return dir;
}

function runFixture(dir: string, env: NodeJS.ProcessEnv) {
  return runWrapper(path.join(dir, "scripts", "predeploy-freshness.mjs"), env);
}

function stubMarker(dir: string): string | null {
  const marker = path.join(dir, "scripts", "stub-invoked.txt");
  return existsSync(marker) ? readFileSync(marker, "utf8") : null;
}

afterEach(() => {
  while (fixtureDirs.length > 0) {
    rmSync(fixtureDirs.pop()!, { recursive: true, force: true });
  }
});

describe("predeploy freshness wrapper credentials", () => {
  it("refuses to deploy when no upstream credentials are configured", () => {
    const result = runWrapper(WRAPPER, cleanEnv());

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("refusing deploy");
    expect(result.stderr).toContain("upstream freshness cannot be verified");
  });

  it("treats empty credential values as absent", () => {
    const result = runWrapper(
      WRAPPER,
      cleanEnv({ SHARED_ARTIFACT_PAT: "", GITHUB_TOKEN: "", GH_TOKEN: "" }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("refusing deploy");
  });
});

describe("predeploy freshness wrapper delegation", () => {
  it("runs the freshness check and succeeds when it exits 0", () => {
    const dir = makeFixture();
    const result = runFixture(
      dir,
      cleanEnv({ SHARED_ARTIFACT_PAT: "fixture-pat", STUB_EXIT_CODE: "0", STUB_MARKER: "pat-run" }),
    );

    expect(result.status).toBe(0);
    expect(stubMarker(dir)).toBe("pat-run");
  });

  it("propagates the freshness check exit code", () => {
    const dir = makeFixture();
    const result = runFixture(
      dir,
      cleanEnv({ GITHUB_TOKEN: "fixture-token", STUB_EXIT_CODE: "7", STUB_MARKER: "exit7" }),
    );

    expect(result.status).toBe(7);
    expect(stubMarker(dir)).toBe("exit7");
  });

  it("still invokes the check when GITHUB_TOKEN is empty but SHARED_ARTIFACT_PAT is set", () => {
    const dir = makeFixture();
    const result = runFixture(
      dir,
      cleanEnv({
        GITHUB_TOKEN: "",
        SHARED_ARTIFACT_PAT: "fixture-pat",
        STUB_EXIT_CODE: "0",
        STUB_MARKER: "pat-fallback",
      }),
    );

    expect(result.status).toBe(0);
    expect(stubMarker(dir)).toBe("pat-fallback");
  });

  it("still invokes the check when GITHUB_TOKEN is empty but GH_TOKEN is set", () => {
    const dir = makeFixture();
    const result = runFixture(
      dir,
      cleanEnv({
        GITHUB_TOKEN: "",
        GH_TOKEN: "fixture-gh-token",
        STUB_EXIT_CODE: "0",
        STUB_MARKER: "gh-fallback",
      }),
    );

    expect(result.status).toBe(0);
    expect(stubMarker(dir)).toBe("gh-fallback");
  });
});
