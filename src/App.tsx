import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";

import * as api from "./api";
import type { Account, Champion, ChampionData, Config } from "./types";
import { accountKey, parseRank } from "./types";
import { isTauri } from "./mock";
import { guessId } from "./champions";
import { AccountsPage } from "./components/AccountsPage";
import { ChampionsPage } from "./components/ChampionsPage";
import { AccountDialog } from "./components/AccountDialog";
import { Toast, type ToastState } from "./components/Toast";
import { TitleBar } from "./components/TitleBar";

const SAVE_DEBOUNCE_MS = 800;
const TOAST_HOLD_MS = 1700;
const FLASH_MS = 200;

type DialogState = { open: false } | { open: true; index: number | null };

/** Seed the picker from the user's own pools so it works before the index loads. */
function seedIndex(config: Config): Champion[] {
  const names = [...new Set(config.champion_pools.flatMap((p) => p.champions))];
  return names.sort().map((name) => ({ name, id: guessId(name) }));
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [ranks, setRanks] = useState<Record<string, string>>({});
  const [champions, setChampions] = useState<ChampionData>({ version: "", champions: [] });
  const [portraitDir, setPortraitDir] = useState("");
  const [tab, setTab] = useState<"accounts" | "champions">("accounts");

  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ open: false });

  const [addingRole, setAddingRole] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState("");
  const [addHighlight, setAddHighlight] = useState(0);
  const [hoverChamp, setHoverChamp] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastState>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const dragMoved = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);
  const toastTimers = useRef<number[]>([]);
  const latest = useRef<Config | null>(null);
  latest.current = config;

  /* ---------- toast ---------- */

  const notify = useCallback((message: string) => {
    toastTimers.current.forEach(clearTimeout);
    toastTimers.current = [];
    setToast({ id: Date.now(), message });
    setToastVisible(true);
    toastTimers.current.push(
      window.setTimeout(() => setToastVisible(false), TOAST_HOLD_MS),
      window.setTimeout(() => setToast(null), TOAST_HOLD_MS + 260),
    );
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
      let payload = current;
      if (isTauri()) {
        // innerSize, not outerSize: the outer size includes the invisible
        // resize border, and restoring that as the requested size makes the
        // window grow a little on every launch.
        const window_ = getCurrentWindow();
        const scale = await window_.scaleFactor();
        const inner = (await window_.innerSize()).toLogical(scale);
        const position = (await window_.outerPosition()).toLogical(scale);
        payload = {
          ...current,
          window: {
            width: Math.round(inner.width),
            height: Math.round(inner.height),
            x: Math.round(position.x),
            y: Math.round(position.y),
          },
        };
      }
      await api.saveConfig(payload);
    } catch (e) {
      notify(`Save failed: ${e}`);
    }
  }, [notify]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS);
  }, [saveNow]);

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

  /**
   * A rank we could not confirm must never keep showing its cached value —
   * that would look current when it is not. On any failure the affected
   * accounts are marked so the card renders "Error"; the reason goes to a toast.
   */
  const refresh = useCallback(
    async (accounts: Account[], quiet = false) => {
      if (accounts.length === 0) return;
      setRefreshing(true);
      try {
        const fresh = await api.fetchRanks(accounts);
        setRanks((prev) => ({ ...prev, ...fresh }));

        const failed = accounts.filter((a) => {
          const value = fresh[accountKey(a)];
          return !value || parseRank(value).isError;
        });
        if (failed.length > 0) {
          const reason = fresh[accountKey(failed[0])] ?? "no response";
          notify(
            failed.length === 1
              ? `${failed[0].riot_name}: ${reason}`
              : `${failed.length} accounts failed to refresh — ${reason}`,
          );
        } else if (!quiet) {
          notify("Ranks up to date");
        }
      } catch (e) {
        // Whole-request failure: mark every requested account so no stale value
        // is left on screen pretending to be current.
        setRanks((prev) => {
          const next = { ...prev };
          for (const a of accounts) next[accountKey(a)] = "Connection Error";
          return next;
        });
        notify(String(e).replace(/^Error:\s*/, ""));
      } finally {
        setRefreshing(false);
      }
    },
    [notify],
  );

  /* ---------- startup ---------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const boot = await api.bootstrap();
      if (cancelled) return;
      setConfig(boot.config);
      latest.current = boot.config;
      setRanks(boot.ranks);
      setPortraitDir(boot.portrait_dir);
      setChampions(
        boot.champions.champions.length > 0
          ? boot.champions
          : { version: boot.champions.version, champions: seedIndex(boot.config) },
      );
      if (boot.has_api_key) void refresh(boot.config.accounts, true);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Champion data refreshes in the background at launch; when Riot has
  // something new the UI redraws in place rather than needing a restart.
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen<ChampionData>("champions-updated", (event) => {
      if (event.payload?.champions?.length) setChampions(event.payload);
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  /**
   * Snap stored pool names to Riot's canonical spelling.
   *
   * A name that differs only in case ("K'sante" vs "K'Sante") breaks portrait
   * lookup and the already-in-pool check. Runs whenever the index changes, so
   * it also repairs names Riot renames later.
   */
  useEffect(() => {
    if (champions.champions.length === 0 || !latest.current) return;
    const canonical = new Map(champions.champions.map((c) => [c.name.toLowerCase(), c.name]));
    let changed = false;

    const pools = latest.current.champion_pools.map((pool) => {
      const fixed = pool.champions.map((name) => {
        const proper = canonical.get(name.toLowerCase());
        if (proper && proper !== name) {
          changed = true;
          return proper;
        }
        return name;
      });
      return changed ? { ...pool, champions: fixed } : pool;
    });

    if (changed) mutate((c) => ({ ...c, champion_pools: pools }));
  }, [champions, mutate]);

  /* ---------- shortcuts and shutdown ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDialog({ open: false });
        setPendingDelete(null);
        setAddingRole(null);
        return;
      }
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

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = getCurrentWindow().onResized(() => scheduleSave());
    return () => {
      void unlisten.then((f) => f());
    };
  }, [scheduleSave]);

  useEffect(
    () => () => {
      toastTimers.current.forEach(clearTimeout);
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    },
    [],
  );

  if (!config) {
    return (
      <div className="flex h-full flex-col">
        <TitleBar />
      </div>
    );
  }

  /* ---------- handlers ---------- */

  const copy = async (text: string, key: string, message: string) => {
    await api.copyText(text);
    setCopied(key);
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setCopied(null), FLASH_MS);
    notify(message);
  };

  const moveAccount = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= config.accounts.length) return;
    mutate((c) => {
      const accounts = [...c.accounts];
      [accounts[index], accounts[target]] = [accounts[target], accounts[index]];
      return { ...c, accounts };
    });
    notify("Order saved");
  };

  const reorderByDrag = (over: number) => {
    if (dragIndex === null || dragIndex === over) return;
    mutate((c) => {
      const accounts = [...c.accounts];
      const [moved] = accounts.splice(dragIndex, 1);
      accounts.splice(over, 0, moved);
      return { ...c, accounts };
    });
    setDragIndex(over);
    dragMoved.current = true;
  };

  const confirmDelete = (index: number) => {
    const name = config.accounts[index].riot_name;
    mutate((c) => ({ ...c, accounts: c.accounts.filter((_, i) => i !== index) }));
    setPendingDelete(null);
    notify(`Deleted ${name}`);
  };

  const saveAccount = (account: Account) => {
    if (!dialog.open) return;
    const index = dialog.index;
    setDialog({ open: false });

    if (index === null) {
      mutate((c) => ({ ...c, accounts: [...c.accounts, account] }));
      notify(`Added ${account.riot_name}`);
      void refresh([account], true);
      return;
    }
    const previous = config.accounts[index];
    mutate((c) => ({
      ...c,
      accounts: c.accounts.map((a, i) => (i === index ? account : a)),
    }));
    notify(`Saved ${account.riot_name}`);
    if (accountKey(previous) !== accountKey(account)) void refresh([account], true);
  };

  const pickChampion = (role: string, champion: Champion) => {
    const pool = config.champion_pools.find((p) => p.role === role);
    if (pool?.champions.some((c) => c.toLowerCase() === champion.name.toLowerCase())) {
      notify(`${champion.name} is already in ${role}`);
      return;
    }
    mutate((c) => ({
      ...c,
      champion_pools: c.champion_pools.map((p) =>
        p.role === role ? { ...p, champions: [...p.champions, champion.name] } : p,
      ),
    }));
    // Picking closes the row; reopening with + is one click if you want another.
    setAddingRole(null);
    setAddDraft("");
    setAddHighlight(0);
    notify(`Added ${champion.name} to ${role}`);
  };

  const removeChampion = (role: string, name: string) => {
    mutate((c) => ({
      ...c,
      champion_pools: c.champion_pools.map((p) =>
        p.role === role ? { ...p, champions: p.champions.filter((x) => x !== name) } : p,
      ),
    }));
    setHoverChamp(null);
    notify(`Removed ${name}`);
  };

  const moveRole = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= config.champion_pools.length) return;
    mutate((c) => {
      const pools = [...c.champion_pools];
      [pools[index], pools[target]] = [pools[target], pools[index]];
      return { ...c, champion_pools: pools };
    });
    notify("Order saved");
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <TitleBar />
      <div className="flex flex-none gap-6 px-5 pt-[18px]">
        <button className="tab" data-active={tab === "accounts"} onClick={() => setTab("accounts")}>
          Accounts
        </button>
        <button
          className="tab"
          data-active={tab === "champions"}
          onClick={() => setTab("champions")}
        >
          Champions
        </button>
        <div className="flex-1 border-b border-line-soft" />
      </div>

      {tab === "accounts" ? (
        <AccountsPage
          accounts={config.accounts}
          ranks={ranks}
          passwordsVisible={config.passwords_visible}
          editing={editing}
          refreshing={refreshing}
          copied={copied}
          pendingDelete={pendingDelete}
          dragIndex={dragIndex}
          onTogglePasswords={() =>
            mutate((c) => ({ ...c, passwords_visible: !c.passwords_visible }))
          }
          onToggleEditing={() => {
            setEditing((v) => !v);
            setPendingDelete(null);
          }}
          onCopy={copy}
          onRefresh={() => void refresh(config.accounts)}
          onAdd={() => setDialog({ open: true, index: null })}
          onEdit={(index) => setDialog({ open: true, index })}
          onAskDelete={setPendingDelete}
          onCancelDelete={() => setPendingDelete(null)}
          onConfirmDelete={confirmDelete}
          onMove={moveAccount}
          onDragStart={(index) => {
            setDragIndex(index);
            setPendingDelete(null);
            dragMoved.current = false;
          }}
          onDragOver={reorderByDrag}
          onDragEnd={() => {
            setDragIndex(null);
            // Only claim a save when the order actually changed; a plain click
            // also fires dragend.
            if (dragMoved.current) notify("Order saved");
            dragMoved.current = false;
          }}
        />
      ) : (
        <ChampionsPage
          pools={config.champion_pools}
          index={champions.champions}
          version={champions.version}
          portraitDir={portraitDir}
          addingRole={addingRole}
          addDraft={addDraft}
          addHighlight={addHighlight}
          hoverChamp={hoverChamp}
          onStartAdd={(role) => {
            setAddingRole((current) => (current === role ? null : role));
            setAddDraft("");
            setAddHighlight(0);
          }}
          onCancelAdd={() => {
            setAddingRole(null);
            setAddDraft("");
          }}
          onDraftChange={(value) => {
            setAddDraft(value);
            setAddHighlight(0);
          }}
          onHighlight={setAddHighlight}
          onPick={pickChampion}
          onRemove={removeChampion}
          onMoveRole={moveRole}
          onHoverChamp={setHoverChamp}
        />
      )}

      {dialog.open && (
        <AccountDialog
          account={dialog.index === null ? null : config.accounts[dialog.index]}
          onSave={saveAccount}
          onCancel={() => setDialog({ open: false })}
        />
      )}

      <Toast toast={toast} visible={toastVisible} />
    </div>
  );
}
