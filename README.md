# LoL-Info

A small desktop app for managing League of Legends accounts: click-to-copy
credentials, live solo-queue ranks, and per-role champion pools.

Tauri 2 (Rust) + React + Tailwind. Windows-focused; the WebView2 runtime it
renders in ships with Windows 11.

## Running from source

```bash
npm install
cp .env.example .env      # then paste your Riot API key into it
npm run tauri dev
```

Get a development API key at <https://developer.riotgames.com/>. Development
keys expire every 24 hours; a personal or production key lasts longer.

### Iterating on the UI without Rust

```bash
npm run dev        # http://localhost:1420 in any browser
npm run shot       # renders the UI to screenshots/ via headless Edge
```

Outside Tauri the frontend falls back to placeholder data (`src/mock.ts`), so
the whole UI can be designed in a normal browser with hot reload — no Rust
rebuild, no real credentials on screen. This is the loop to use when pasting in
a design from Claude Design.

## Building

```bash
npm run tauri build
```

Produces `src-tauri/target/release/lol-info.exe` (~4.5 MB) and an NSIS
installer under `src-tauri/target/release/bundle/nsis/`.

The built exe reads `.env` from its own directory, the working directory, or
`%APPDATA%\LoLinfo\`. Putting a copy in `%APPDATA%\LoLinfo\.env` makes it work
from any location.

## Where your data lives

Nothing is stored in the repo.

| File | Contents |
|---|---|
| `%APPDATA%\LoLinfo\config.json` | Accounts, credentials, champion pools, window size |
| `%APPDATA%\LoLinfo\ranks.json` | Cached ranks, so cards render populated at startup |
| `.env` | `RIOT_API_KEY` only. Gitignored. |

The API key is read in Rust and **never** crosses into the webview or gets
written to `config.json`.

Riot API calls run in Rust rather than the frontend because the API sends no
CORS headers — a `fetch` from `tauri://localhost` would be blocked.

## Using it

**Accounts.** Click any riot ID, account name, or password to copy it — the
field flashes and a toast confirms. *Show passwords* unmasks, *Edit* reveals
reorder / edit / delete controls, *Add* creates one. Cards are also drag-
reorderable. Ranks load from cache instantly, then refresh in the background.

**Champions.** Press `+` on a role, type, and pick from the dropdown — free
text can't be submitted, so pool names always match Riot's spelling. Hover a
portrait to remove it. Roles reorder with the arrows in each heading.

| Shortcut | Action |
|---|---|
| `Ctrl+R` | Refresh ranks |
| `Ctrl+S` | Save now |
| `Esc` | Close dialog / cancel delete / close add row |
| `↑` `↓` `⏎` | Navigate and pick in the champion picker |

## Layout

```
src/
  App.tsx                 state, persistence, shortcuts
  api.ts                  Tauri command bridge (mock fallback in browser dev)
  types.ts                shared types, rank parsing, tier colours
  champions.ts            portrait URLs, asset ids, picker search
  mock.ts                 placeholder data for browser dev only
  styles.css              Tailwind v4 + design tokens
  components/             AccountsPage, ChampionsPage, AccountDialog,
                          Portrait, Toast
src-tauri/src/
  config.rs               config + rank cache, .env resolution, atomic writes
  riot.rs                 concurrent Riot API client
  ddragon.rs              champion index + portrait cache, background refresh
  lib.rs                  Tauri commands
tools/screenshot.mjs      headless UI capture
```

## Champion data

Names, asset ids and portraits come from Riot's Data Dragon CDN. The app is
cache-first and never blocks on it: the cached copy renders immediately, a
background task refreshes at launch, and the UI redraws in place only if
something actually changed — new champions after a patch, say. Everything is
cached to disk, so the grid works offline.

Portraits reach the webview through Tauri's asset protocol. Note that the
`$APPDATA` scope variable resolves to `%APPDATA%\<bundle identifier>`, **not**
this app's `%APPDATA%\LoLinfo`, so `tauri.conf.json` uses an explicit absolute
scope pattern. Getting that wrong fails silently — portraits quietly fall back
to the network and only break once you're offline.

## History

Three versions, each measured on the same machine with the same data
(8 accounts, 35 champions):

| | CustomTkinter | PySide6 | Tauri |
|---|---:|---:|---:|
| Usable UI | 4,670 ms | 1,040 ms | **~135 ms** |
| Resize reflow | 2,050 ms | 18 ms | **~4 ms** |
| Bundle | 32 MB | 119 MB | **4.5 MB** |

The CustomTkinter build destroyed and rebuilt every champion chip on each
resize, and padded startup with ~600 ms of hardcoded sleeps plus a 2 s delay
before ranks loaded. PySide6 fixed the algorithms; Tauri removed the remaining
runtime cost and made the UI designable in CSS.

Both earlier implementations have been retired. The PySide6 source remains in
git history at commit `77394ad`; the original CustomTkinter version was never
committed and is gone.
