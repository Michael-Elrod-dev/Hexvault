import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Account, Bootstrap, Config } from "./types";
import { isTauri, mockBootstrap, mockRanks } from "./mock";

/** True when running `npm run dev` in a plain browser. Dead code in release builds. */
const useMock = () => import.meta.env.DEV && !isTauri();

export const bootstrap = async (): Promise<Bootstrap> =>
  useMock() ? mockBootstrap() : invoke<Bootstrap>("bootstrap");

export const saveConfig = async (config: Config): Promise<void> => {
  if (useMock()) return;
  return invoke<void>("save_config", { config });
};

/** Resolves account key -> rank text. The API key stays in Rust. */
export const fetchRanks = async (accounts: Account[]): Promise<Record<string, string>> =>
  useMock() ? mockRanks() : invoke<Record<string, string>>("fetch_ranks", { accounts });

export const copyText = async (text: string): Promise<void> => {
  if (useMock()) {
    await navigator.clipboard?.writeText(text).catch(() => {});
    return;
  }
  return writeText(text);
};
