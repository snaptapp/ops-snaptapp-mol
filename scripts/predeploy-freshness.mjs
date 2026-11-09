#!/usr/bin/env node
/**
 * Pre-deploy upstream freshness check, run by `npm run build` immediately
 * before the Vite build that Workers Builds deploys.
 *
 * The Quality_Gate stays network-free by design, so upstream freshness is
 * enforced here instead. This wrapper delegates to
 * scripts/check-artifact-freshness.mjs and propagates its exit code: a stale
 * or unverifiable upstream handoff fails the build before deploy.
 *
 * The check needs read access to the private upstream repository. It runs
 * when SHARED_ARTIFACT_PAT or GITHUB_TOKEN is present in the build
 * environment (the scheduled freshness workflow uses the same secret name).
 * Workers Builds clones only this repository, so provision
 * SHARED_ARTIFACT_PAT in the Workers Builds environment to activate the hard
 * gate. Without credentials the deploy proceeds with a loud warning rather
 * than silently skipping verification.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const hasToken = Boolean(
  process.env.SHARED_ARTIFACT_PAT || process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
);

if (!hasToken) {
  process.stderr.write(
    "predeploy-freshness: upstream freshness not verified: no SHARED_ARTIFACT_PAT or " +
      "GITHUB_TOKEN in the build environment. Provision SHARED_ARTIFACT_PAT to enforce " +
      "freshness before deploy.\n",
  );
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  ["scripts/check-artifact-freshness.mjs"],
  { cwd: root, stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
