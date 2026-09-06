import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import * as api from "./api";
import type { Account, Config } from "./types";
import { accountKey } from "./types";
import { isTauri } from "./mock";
import { AccountsPage } from "./components/AccountsPage";
import { ChampionsPage } from "./components/ChampionsPage";
import { AccountDialog } from "./components/AccountDialog";
import { Toast, type ToastState } from "./components/Toast";

const SAVE_DEBOUNCE_MS = 800;

type DialogState = { open: false } | { open: true; index: number | null };

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [ranks, setRanks] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"accounts" | "champions">("accounts");
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [dialog, setDialog] = useState<DialogState>({ open: false });

  const saveTimer = useRef<number | null>(null);
  const latest = useRef<Config | null>(null);
  latest.current = config;

  const notify = useCallback((message: string) => {
    setToast({ id: Date.now(), message });
  }, []);

  /* ---------- persistence ---------- */

  const saveNow = useCallback(async () => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const current = latest.current;
    if (!current) return;
    try {
      // Window geometry is only available under Tauri; in browser dev mode the
      // stored size is left untouched.
      let withWindow = current;
      if (isTauri()) {
        const { width, height } = await getCurrentWindow().outerSize();
        const position = await getCurrentWindow().outerPosition();
        withWindow = { ...current, window: { width, height, x: position.x, y: position.y } };
      }
      await api.saveConfig(withWindow);
      setSaving("Saved ✓");
      setTimeout(() => setSaving(""), 1500);
    } catch (e) {
      setSaving("");
      notify(`Save failed: ${e}`);
    }
  }, [notify]);

  const scheduleSave = useCallback(() => {
    setSaving("Saving…");
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS);
  }, [saveNow]);

  /** Apply a change to config and schedule a save. */
  const mutate = useCallback(
    (fn: (draft: Config) => Config) => {
      setConfig((current) => {
        if (!current) return current;
        const next = fn(current);
        latest.current = next;
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  /* ---------- ranks ---------- */

  const refresh = useCallback(async (accounts: Account[]) => {
    if (accounts.length === 0) return;
    setRefreshing(true);
    try {
      const fresh = await api.fetchRanks(accounts);
      setRanks((prev) => ({ ...prev, ...fresh }));
    } catch (e) {
      notify(String(e));
    } finally {
      setRefreshing(false);
    }
  }, [notify]);

  /* ---------- startup ---------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const boot = await api.bootstrap();
      if (cancelled) return;
      setConfig(boot.config);
      latest.current = boot.config;
      setRanks(boot.ranks);
      // Paint from the cache first, then go to the network.
      if (boot.has_api_key) void refresh(boot.config.accounts);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  /* ---------- shortcuts and shutdown ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === "r") {
        e.preventDefault();
        if (latest.current && !refreshing) void refresh(latest.current.accounts);
      } else if (e.key === "s") {
        e.preventDefault();
        void saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refresh, refreshing, saveNow]);

  // Save on close. Tauri hands the close over to this handler and only destroys
  // the window once it resolves, so the save is raced against a timeout: a hung
  // or slow write must never leave the user unable to close the app.
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = getCurrentWindow().onCloseRequested(async () => {
      await Promise.race([
        saveNow().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, [saveNow]);

  // Persist geometry as it changes, so window size survives even if the
  // close-time save is skipped.
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = getCurrentWindow().onResized(() => scheduleSave());
    return () => {
      void unlisten.then((f) => f());
    };
  }, [scheduleSave]);

  if (!config) {
    return <div className="h-full" />;
  }

  /* ---------- handlers ---------- */

  const copy = async (text: string) => {
    await api.copyText(text);
    notify("Copied to clipboard");
  };

  const moveAccount = (index: number, delta: number) =>
    mutate((c) => {
      const target = index + delta;
      if (target < 0 || target >= c.accounts.length) return c;
      const accounts = [...c.accounts];
      [accounts[index], accounts[target]] = [accounts[target], accounts[index]];
      return { ...c, accounts };
    });

  const deleteAccount = (index: number) => {
    const account = config.accounts[index];
    if (!confirm(`Delete ${account.riot_name}#${account.tag}?\n\nThis removes it from the app only.`)) {
      return;
    }
    mutate((c) => ({ ...c, accounts: c.accounts.filter((_, i) => i !== index) }));
  };

  const saveAccount = (account: Account) => {
    if (!dialog.open) return;
    const index = dialog.index;
    setDialog({ open: false });

    if (index === null) {
      mutate((c) => ({ ...c, accounts: [...c.accounts, account] }));
      void refresh([account]);
      return;
    }
    const previous = config.accounts[index];
    mutate((c) => ({
      ...c,
      accounts: c.accounts.map((a, i) => (i === index ? account : a)),
    }));
    if (accountKey(previous) !== accountKey(account)) void refresh([account]);
  };

  const addChampion = (role: string, champion: string) =>
    mutate((c) => ({
      ...c,
      champion_pools: c.champion_pools.map((p) => {
        if (p.role !== role) return p;
        const exists = p.champions.some((x) => x.toLowerCase() === champion.toLowerCase());
        return exists ? p : { ...p, champions: [...p.champions, champion] };
      }),
    }));

  const removeChampion = (role: string, champion: string) =>
    mutate((c) => ({
      ...c,
      champion_pools: c.champion_pools.map((p) =>
        p.role === role ? { ...p, champions: p.champions.filter((x) => x !== champion) } : p,
      ),
    }));

  return (
    <div className="flex h-full flex-col p-2">
      <div className="flex shrink-0 gap-1 px-2 pt-1">
        <button className="tab" data-active={tab === "accounts"} onClick={() => setTab("accounts")}>
          Accounts
        </button>
        <button className="tab" data-active={tab === "champions"} onClick={() => setTab("champions")}>
          Champions
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "accounts" ? (
          <AccountsPage
            accounts={config.accounts}
            ranks={ranks}
            passwordsVisible={config.passwords_visible}
            editing={editing}
            refreshing={refreshing}
            onTogglePasswords={() =>
              mutate((c) => ({ ...c, passwords_visible: !c.passwords_visible }))
            }
            onToggleEditing={() => setEditing((v) => !v)}
            onCopy={copy}
            onRefresh={() => void refresh(config.accounts)}
            onAdd={() => setDialog({ open: true, index: null })}
            onEdit={(index) => setDialog({ open: true, index })}
            onDelete={deleteAccount}
            onMove={moveAccount}
          />
        ) : (
          <ChampionsPage
            pools={config.champion_pools}
            saving={saving}
            onAdd={addChampion}
            onRemove={removeChampion}
          />
        )}
      </div>

      {dialog.open && (
        <AccountDialog
          account={dialog.index === null ? null : config.accounts[dialog.index]}
          onSave={saveAccount}
          onCancel={() => setDialog({ open: false })}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
