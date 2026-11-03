import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";

import { initAmplitude } from "@/lib/amplitude";
import { AdminAuthProvider } from "@/admin/auth";

import appCss from "../styles.css?url";

// The linked Google Analytics connection supplies the measurement ID; the
// literal fallback keeps tracking alive if the link is removed.
const GA_MEASUREMENT_ID =
  (import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_ANALYTICS_API_KEY as string | undefined)?.trim() ||
  "G-7QMJL9732Z";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Arena Design System" },
      { name: "description", content: "Dark arcade game-show design system: tokens and components." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/more-or-less-icon.png" },
      { rel: "apple-touch-icon", href: "/icon-180.png" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Keep this root providers-only: canvas preview routes (/__mockup,
// /__component) render inside it, so any chrome leaks into every frame.
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pagePath = useRouterState({
    // location.search is a parsed params object; searchStr is the raw query string.
    select: (state) => state.location.pathname + state.location.searchStr,
  });
  const firstRender = useRef(true);

  useEffect(() => {
    initAmplitude();
  }, []);

  // gtag only tracks the initial page load; send a page view on every
  // in-app navigation so admin page usage shows up in Google Analytics.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.gtag?.("event", "page_view", { page_path: pagePath });
  }, [pagePath]);



  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <AdminAuthProvider><Outlet /></AdminAuthProvider>
    </QueryClientProvider>
  );
}
