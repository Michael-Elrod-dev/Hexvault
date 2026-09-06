import { convertFileSrc } from "@tauri-apps/api/core";
import { isTauri } from "./mock";
import type { Champion } from "./types";

/**
 * Data Dragon ids for the handful of champions whose id is not simply the
 * display name with non-letters stripped. Only used when the champion index
 * has not loaded yet — once it has, the id comes from Riot directly and no
 * mapping is needed.
 */
const SPECIAL_IDS: Record<string, string> = {
  "Bel'Veth": "Belveth",
  "Cho'Gath": "Chogath",
  "Kai'Sa": "Kaisa",
  "Kha'Zix": "Khazix",
  // Stripping non-letters yields "Ksante", which 403s; the id keeps the capital S.
  "K'Sante": "KSante",
  "K'sante": "KSante",
  LeBlanc: "Leblanc",
  "Nunu & Willump": "Nunu",
  "Renata Glasc": "Renata",
  "Vel'Koz": "Velkoz",
  Wukong: "MonkeyKing",
};

export function guessId(name: string): string {
  return SPECIAL_IDS[name] ?? name.replace(/[^A-Za-z]/g, "");
}

/** name -> id, from the fetched index, falling back to the guess. */
export function idFor(name: string, index: Champion[]): string {
  const match = index.find((c) => c.name === name);
  if (match) return match.id;
  const ci = index.find((c) => c.name.toLowerCase() === name.toLowerCase());
  return ci ? ci.id : guessId(name);
}

/** Local cached portrait, readable by the webview through the asset protocol. */
export function localPortrait(id: string, portraitDir: string): string | null {
  if (!isTauri() || !portraitDir) return null;
  const separator = portraitDir.includes("\\") ? "\\" : "/";
  return convertFileSrc(`${portraitDir}${separator}${id}.png`);
}

/** Remote portrait, used until the disk cache has filled. */
export function remotePortrait(id: string, version: string): string {
  const v = version || "latest";
  return `https://ddragon.leagueoflegends.com/cdn/${v}/img/champion/${id}.png`;
}

/**
 * Case-insensitive substring match, prefix matches first, excluding champions
 * already in the role. Capped by the caller.
 */
export function searchChampions(
  query: string,
  index: Champion[],
  exclude: string[],
): Champion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const taken = new Set(exclude.map((c) => c.toLowerCase()));

  return index
    .filter((c) => !taken.has(c.name.toLowerCase()))
    .map((c) => ({ champion: c, at: c.name.toLowerCase().indexOf(q) }))
    .filter((m) => m.at !== -1)
    .sort((a, b) => a.at - b.at || a.champion.name.localeCompare(b.champion.name))
    .map((m) => m.champion);
}
