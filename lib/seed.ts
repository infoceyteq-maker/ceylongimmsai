import raw from "@/data/store.json";
import { normalizeHubState, type HubState } from "@/lib/types";

/**
 * Bundled fallback seed. It is intentionally almost empty: no invented tasks,
 * agents, clients, handles or citations. Real records come from
 * public.hub_state (Supabase) through the postgres driver.
 */
export const seedState: HubState = normalizeHubState(raw);
