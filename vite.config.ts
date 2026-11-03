import path from "path";
import { defineConfig, loadEnv } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Publishable Cloud config (safe to ship). `.env` is gitignored, so builds from
// GitHub would otherwise bundle an auth client with no URL/key and blank-screen.
const PUBLIC_CLOUD_ENV = {
  VITE_SUPABASE_URL: "https://vjoupuoubrvtdhljukhr.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_hy4cUpgGlwdQFnHdejYmwA_7oPdWkLr",
  VITE_SUPABASE_PROJECT_ID: "vjoupuoubrvtdhljukhr",
} as const;

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const define = Object.fromEntries(
    Object.entries(PUBLIC_CLOUD_ENV).map(([k, v]) => [
      `import.meta.env.${k}`,
      JSON.stringify(env[k] || process.env[k] || v),
    ]),
  );
  // Cloudflare Workers plugin only on build (produces the worker output);
  // the workerd runtime isn't available for the dev server.
  const useCloudflare = command === "build";

  return {
    define,
    server: {
      host: "::",
      port: Number(process.env.PORT) || 3000,
    },
    // `cloudflare:workers` only exists inside workerd; without this the client
    // dependency scan fails, deps get discovered lazily, and open tabs break
    // on mid-session re-optimization reloads.
    optimizeDeps: {
      exclude: ["cloudflare:workers"],
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    plugins: [
      mcpPlugin(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      ...(useCloudflare ? [cloudflare({ viteEnvironment: { name: "ssr" } })] : []),
      tanstackStart(),
      viteReact(),
      ...(mode === "development" ? [componentTagger()] : []),
    ],
  };
});
