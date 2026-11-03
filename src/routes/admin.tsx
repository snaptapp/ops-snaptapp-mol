import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getAdminSession } from "@/lib/admin/session.functions";
import { AdminShell } from "@/admin/AdminShell";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", replace: true });
    try {
      await getAdminSession();
    } catch {
      throw redirect({ to: "/auth", search: { access: "denied" }, replace: true });
    }
  },
  head: () => ({
    meta: [
      { title: "More or Less — Admin Portal" },
      {
        name: "description",
        content: "Internal operations console for the More or Less trivia game.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "More or Less — Admin Portal" },
      { property: "og:description", content: "Internal operations console for the More or Less trivia game." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminShell><Outlet /></AdminShell>
  );
}
