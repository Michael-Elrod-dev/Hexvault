/**
 * Placeholder data for `npm run dev` outside Tauri. Only reachable when
 * `import.meta.env.DEV` is true and the Tauri bridge is absent.
 */
import type { Bootstrap, Config } from "./types";

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const MOCK_CONFIG: Config = {
  version: 2,
  window: { width: 520, height: 900, x: null, y: null },
  passwords_visible: false,
  accounts: [
    { riot_name: "ExampleOne", tag: "NA1", login: "example_login_1", password: "hunter2" },
    { riot_name: "ExampleTwo", tag: "NA1", login: "example_login_2", password: "hunter2" },
    { riot_name: "Example Three", tag: "NA1", login: "example_login_3", password: "hunter2" },
    { riot_name: "ExampleFour", tag: "EUW", login: "example_login_4", password: "hunter2" },
    { riot_name: "ExampleFive", tag: "NA1", login: "example_login_5", password: "hunter2" },
    { riot_name: "Example Six", tag: "NA1", login: "example_login_6", password: "hunter2" },
  ],
  champion_pools: [
    {
      role: "Jungle", icon: "🌲", color: "#4ECDC4",
      champions: ["Viego", "Zed", "Talon", "Pantheon", "Darius", "Fiddlesticks",
                  "Diana", "Zac", "Lillia", "Ekko", "Jax", "Naafiri", "Graves"],
    },
    {
      role: "Mid", icon: "⚔️", color: "#FF6B6B",
      champions: ["Orianna", "Viktor", "Zoe", "Akshan", "Akali", "Talon", "Ryze"],
    },
    {
      role: "Bot", icon: "🏹", color: "#45B7D1",
      champions: ["Ezreal", "Aphelios", "Zeri", "Jhin", "Caitlyn", "Hwei",
                  "Vayne", "Lucian", "Xayah"],
    },
    { role: "Top", icon: "⚡", color: "#FFEAA7", champions: ["Gnar", "Sion", "K'sante"] },
    { role: "Support", icon: "🛡️", color: "#96CEB4", champions: ["Thresh", "Senna", "Karma"] },
  ],
};

const MOCK_RANKS: Record<string, string> = {
  "exampleone#na1": "Emerald IV • 87 LP",
  "exampletwo#na1": "Platinum IV • 42 LP",
  "example three#na1": "Gold II • 99 LP",
  "examplefour#euw": "Diamond III • 12 LP",
  "examplefive#na1": "Grandmaster I • 512 LP",
  "example six#na1": "Silver I • 30 LP",
};

const MOCK_CHAMPIONS = [...new Set(MOCK_CONFIG.champion_pools.flatMap((p) => p.champions))]
  .sort()
  .map((name) => ({ name, id: name.replace(/[^A-Za-z]/g, "") }));

export const mockBootstrap = (): Bootstrap => ({
  config: structuredClone(MOCK_CONFIG),
  ranks: { ...MOCK_RANKS },
  has_api_key: true,
  // No disk cache in the browser. Portraits come from the CDN.
  champions: { version: "16.17.1", champions: MOCK_CHAMPIONS },
  portrait_dir: "",
});

export const mockRanks = () => ({ ...MOCK_RANKS });
