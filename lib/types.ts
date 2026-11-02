export type HubItem = Record<string, any>;

export type HubState = {
  tasks: HubItem[];
  agents: HubItem[];
  clients: HubItem[];
  channels: HubItem[];
  publishes: HubItem[];
  outputs: HubItem[];
  research: HubItem[];
  audience: HubItem[];
  calls: HubItem[];
  conversations: HubItem[];
  audit: HubItem[];
};

export type StorageDriver = "postgres" | "file" | "memory";

const KEYS: (keyof HubState)[] = [
  "tasks",
  "agents",
  "clients",
  "channels",
  "publishes",
  "outputs",
  "research",
  "audience",
  "calls",
  "conversations",
  "audit",
];

/** Never trust the shape of remote jsonb: always return all eleven arrays. */
export function normalizeHubState(raw: unknown): HubState {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const state = {} as HubState;
  for (const key of KEYS) {
    state[key] = Array.isArray(source[key]) ? (source[key] as HubItem[]) : [];
  }
  return state;
}

export function connectedCount(state: HubState): number {
  return state.channels.filter((channel) => channel?.connected === true).length;
}
