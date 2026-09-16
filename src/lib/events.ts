import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Author events — book launches, fairs, readings — as the storefront sees them.
 *
 * Read with the anon key and no session, so the `events_public_read` policy
 * decides: an unpublished event is invisible here however it is asked for.
 * Writes happen only in the admin, through the service-role client.
 */

export interface EventRecord {
  id: string;
  title: string;
  /** YYYY-MM-DD, the day of the event in India. */
  date: string;
  location: string;
  description: string;
  link: string;
}

function publicClient() {
  return createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Today's date in India, as YYYY-MM-DD. */
export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** Published events from today onwards, soonest first. */
export async function listUpcomingEvents(): Promise<EventRecord[]> {
  const { data, error } = await publicClient()
    .from("events")
    .select("id, title, date, location, description, link")
    .gte("date", todayInIndia())
    .order("date", { ascending: true });
  if (error) throw new Error(`Could not load events: ${error.message}`);
  return data ?? [];
}

/** One published event, or null. Past events are included — registration decides for itself. */
export async function getPublishedEvent(id: string): Promise<EventRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await publicClient()
    .from("events")
    .select("id, title, date, location, description, link")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}
