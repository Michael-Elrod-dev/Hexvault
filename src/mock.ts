/**
 * Browser fallback for `npm run dev` outside Tauri.
 *
 * Lets the UI be opened in a normal browser to iterate on design (paste in a
 * Claude Design screen, tweak Tailwind, reload) without rebuilding Rust. Only
 * ever reachable when `import.meta.env.DEV` is true AND the Tauri IPC bridge is
 * absent, so it cannot ship in a release build or shadow the real backend.
 *
 * The data here is placeholder, deliberately not real credentials.
 */
import type { Bootstrap, Config } from "./types";

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const MOCK_CONFIG: Config = {
  version: 1,
  window: { width: 520, height: 900, x: null, y: null },
  passwords_visible: false,
  accounts: [
    { riot_name: "ExampleOne", tag: "NA1", login: "example_login_1", password: "hunter2", role: null },
    { riot_name: "ExampleTwo", tag: "NA1", login: "example_login_2", password: "hunter2", role: "ADC" },
    { riot_name: "Example Three", tag: "NA1", login: "example_login_3", password: "hunter2", role: "MID" },
    { riot_name: "ExampleFour", tag: "EUW", login: "example_login_4", password: "hunter2", role: "SUP" },
    { riot_name: "ExampleFive", tag: "NA1", login: "example_login_5", password: "hunter2", role: "TOP" },
    { riot_name: "Example Six", tag: "NA1", login: "example_login_6", password: "hunter2", role: "JG" },
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

export const mockBootstrap = (): Bootstrap => ({
  config: structuredClone(MOCK_CONFIG),
  ranks: { ...MOCK_RANKS },
  has_api_key: true,
});

export const mockRanks = () => ({ ...MOCK_RANKS });
