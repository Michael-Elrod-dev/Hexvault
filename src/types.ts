export type Account = {
  riot_name: string;
  tag: string;
  login: string;
  password: string;
};

export type Pool = {
  role: string;
  icon: string;
  color: string;
  champions: string[];
};

export type WindowState = {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
};

export type Config = {
  version: number;
  window: WindowState;
  passwords_visible: boolean;
  accounts: Account[];
  champion_pools: Pool[];
};

/** Display name plus the Data Dragon asset id used to build the portrait URL. */
export type Champion = {
  name: string;
  id: string;
};

export type ChampionData = {
  version: string;
  champions: Champion[];
};

export type Bootstrap = {
  config: Config;
  ranks: Record<string, string>;
  has_api_key: boolean;
  champions: ChampionData;
  portrait_dir: string;
};

/** Cache identity. Must match Account::key in Rust. */
export function accountKey(a: Account): string {
  return `${a.riot_name.toLowerCase()}#${a.tag.toLowerCase()}`;
}

export function riotId(a: Account): string {
  return `${a.riot_name}#${a.tag}`;
}

/* Ordered longest-first so "Grandmaster" is matched before "Master". */
const TIER_COLORS: [string, string][] = [
  ["Challenger", "#00BFFF"],
  ["Grandmaster", "#FF6B6B"],
  ["Master", "#9932CC"],
  ["Diamond", "#B9F2FF"],
  ["Emerald", "#50C878"],
  ["Platinum", "#00CED1"],
  ["Gold", "#FFD700"],
  ["Silver", "#C0C0C0"],
  ["Bronze", "#CD7F32"],
  ["Iron", "#8B4513"],
];

const NEUTRAL = "#8E867A";

export function rankColor(tier: string): string {
  for (const [name, color] of TIER_COLORS) {
    if (tier.includes(name)) return color;
  }
  return NEUTRAL;
}

/**
 * Everything the Riot client can return that is not an actual rank. These must
 * never be rendered as if they were a tier — see parseRank.
 */
const NON_RANKS = new Set([
  "Unranked",
  "Account Not Found",
  "Invalid API Key",
  "Rate Limited",
  "Timed Out",
  "Connection Error",
  "Data Parse Error",
]);

export type ParsedRank = {
  /** Text shown in the tier slot, e.g. "Grandmaster I", "Unranked", "Error". */
  label: string;
  /** LP text, or "—" when there is none. */
  lp: string;
  color: string;
  /** True when this represents a failure rather than a real rank. */
  isError: boolean;
};

const UNKNOWN: ParsedRank = { label: "—", lp: "—", color: NEUTRAL, isError: false };

/**
 * Turn a cached rank string into display parts.
 *
 * The Rust client emits "Gold II • 45 LP" for ranked accounts, "Unranked" for
 * unranked ones, and a short message for failures. Failures collapse to a bare
 * "Error" so a stale value can never sit on screen looking current; the real
 * reason goes to a toast.
 */
export function parseRank(rank: string | undefined): ParsedRank {
  if (!rank) return UNKNOWN;
  if (rank === "Unranked") {
    return { label: "Unranked", lp: "—", color: NEUTRAL, isError: false };
  }
  if (NON_RANKS.has(rank) || rank.startsWith("API Error")) {
    return { label: "Error", lp: "—", color: NEUTRAL, isError: true };
  }

  const [head, lpPart] = rank.split(" • ");
  const bits = head.trim().split(/\s+/);
  const division = bits.length > 1 ? bits.pop()! : "";
  const tier = bits.join(" ");
  if (!tier) return UNKNOWN;

  return {
    label: division ? `${tier} ${division}` : tier,
    lp: lpPart ? lpPart.replace(/\s*LP\s*$/i, "") + " LP" : "—",
    color: rankColor(tier),
    isError: false,
  };
}
