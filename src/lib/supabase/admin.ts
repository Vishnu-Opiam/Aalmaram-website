import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client. Bypasses RLS completely, so it is the only way the app
 * touches orders, customers, discounts, shipments and the outbox.
 *
 * `server-only` above makes importing this from a Client Component a build
 * error rather than a leaked key.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: {
      // Nothing to persist: this client is never a user.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
