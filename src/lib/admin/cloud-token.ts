import { supabase } from "@/integrations/supabase/client";

export async function getCloudToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}