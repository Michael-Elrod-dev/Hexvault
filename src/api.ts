import { invoke } from "@tauri-apps/api/core";
import type { Account, Bootstrap, Config } from "./types";

export const bootstrap = (): Promise<Bootstrap> => invoke<Bootstrap>("bootstrap");

export const saveConfig = (config: Config): Promise<void> =>
  invoke<void>("save_config", { config });

/** Resolves account key -> rank text. The API key stays in Rust. */
export const fetchRanks = (accounts: Account[]): Promise<Record<string, string>> =>
  invoke<Record<string, string>>("fetch_ranks", { accounts });

/** Rust keeps the value out of clipboard history and clears it after 30 seconds. */
export const copyText = (text: string): Promise<void> => invoke<void>("copy_text", { text });
