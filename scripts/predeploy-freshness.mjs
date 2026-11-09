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
 * with SHARED_ARTIFACT_PAT, GITHUB_TOKEN, or GH_TOKEN in the build
 * environment (the scheduled freshness workflow uses the same secret name).
 * Workers Builds clones only this repository, so provision
 * SHARED_ARTIFACT_PAT in the Workers Builds environment. Without credentials
 * the build fails closed. Use build:dev for an offline local build instead.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const hasToken = [process.env.SHARED_ARTIFACT_PAT, process.env.GITHUB_TOKEN, process.env.GH_TOKEN].some(
  (value) => Boolean(value?.trim()),
);

if (!hasToken) {
  process.stderr.write(
    "predeploy-freshness: refusing deploy because upstream freshness cannot be verified: " +
      "no SHARED_ARTIFACT_PAT, GITHUB_TOKEN, or GH_TOKEN in the build environment. " +
      "Provision SHARED_ARTIFACT_PAT, or use build:dev for an offline local build.\n",
  );
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["scripts/check-artifact-freshness.mjs"],
  { cwd: root, stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
