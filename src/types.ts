export type Account = {
  riot_name: string;
  tag: string;
  login: string;
  password: string;
  role: string | null;
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

export type Bootstrap = {
  config: Config;
  ranks: Record<string, string>;
  has_api_key: boolean;
};

export const ROLES = ["", "TOP", "JG", "MID", "ADC", "SUP"] as const;

/** Cache identity. Must match Account::key in Rust and the Python `key`. */
export function accountKey(a: Account): string {
  return `${a.riot_name.toLowerCase()}#${a.tag.toLowerCase()}`;
}

export function riotId(a: Account): string {
  return `${a.riot_name}#${a.tag}`;
}

/* Ordered longest-first so "Grandmaster" is matched before "Master" — the
   original Qt build tested "Master" first and coloured Grandmaster wrong. */
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

export function rankColor(text: string): string {
  for (const [tier, color] of TIER_COLORS) {
    if (text.includes(tier)) return color;
  }
  return "#888888";
}

/** "Gold II • 45 LP" -> "Gold II" */
export function stripLp(rank: string): string {
  const i = rank.indexOf(" • ");
  return i === -1 ? rank : rank.slice(0, i);
}
