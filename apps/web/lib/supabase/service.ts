import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Supabase service configuration is unavailable.");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
