# LoL-Info

A desktop app for managing League of Legends accounts: click-to-copy
credentials, live solo-queue ranks, and per-role champion pools.

Tauri 2 (Rust) + React + Tailwind. Windows-focused; it renders in WebView2,
which ships with Windows 11.

## Running from source

```bash
npm install
cp .env.example .env      # then paste your Riot API key into it
npm run tauri dev
```

Get an API key at <https://developer.riotgames.com/>. Development keys expire
every 24 hours; a personal or production key lasts longer.

## Building

```bash
npm run tauri build
```

Produces `src-tauri/target/release/lol-info.exe` (~5 MB) and an installer under
`src-tauri/target/release/bundle/nsis/`.

The built exe reads `.env` from its own directory, the working directory, or
`%APPDATA%\LoLinfo\`. Putting a copy in `%APPDATA%\LoLinfo\.env` makes it work
no matter where it is launched from.

## Using it

**Accounts.** Click any riot ID, account name, or password to copy it — the
field flashes and a toast confirms. *Show passwords* unmasks them, *Edit*
reveals per-card reorder / edit / delete controls, and *Add* creates one. Cards
can also be dragged to reorder. Ranks render from cache immediately, then
refresh in the background.

A rank that fails to refresh shows `Error` rather than its cached value, with
the reason in a toast, so a stale rank is never displayed as if it were current.

**Champions.** Press `+` on a role, type, and pick from the dropdown. Free text
cannot be submitted, so pool names always match Riot's spelling. The row closes
when you pick or click away. Hover a portrait to remove that champion, and use
the arrows in each heading to reorder roles.

| Shortcut | Action |
|---|---|
| `Ctrl+R` | Refresh ranks |
| `Ctrl+S` | Save now |
| `Esc` | Close dialog / cancel delete / close add row |
| `↑` `↓` `⏎` | Navigate and pick in the champion picker |

## Where your data lives

Nothing is stored in the repo.

| Path | Contents |
|---|---|
| `%APPDATA%\LoLinfo\config.json` | Accounts, credentials, champion pools, window size |
| `%APPDATA%\LoLinfo\ranks.json` | Cached ranks |
| `%APPDATA%\LoLinfo\champions.json` | Champion names and Data Dragon asset ids |
| `%APPDATA%\LoLinfo\portraits\` | Cached champion portraits (~4.6 MB) |
| `%APPDATA%\LoLinfo\portraits.json` | ETag of each cached portrait, for revalidation |
| `.env` | `RIOT_API_KEY` only. Gitignored. |

The API key is read in Rust and never crosses into the webview or gets written
to `config.json`.

## How it fits together

Rust owns data and network; React is a pure view layer.

```
src/
  App.tsx                 state, persistence, shortcuts
  api.ts                  Tauri command bridge (mock fallback in browser dev)
  types.ts                shared types, rank parsing, tier colours
  champions.ts            portrait URLs, asset ids, picker search
  mock.ts                 placeholder data for browser dev only
  styles.css              Tailwind v4 and the design tokens
  components/             AccountsPage, ChampionsPage, AccountDialog,
                          TitleBar, ScrollArea, Portrait, Toast
src-tauri/src/
  config.rs               config + rank cache, .env resolution, atomic writes
  riot.rs                 concurrent Riot API client
  ddragon.rs              champion index + portrait cache, background refresh
  lib.rs                  Tauri commands and window setup
tools/screenshot.mjs      headless UI capture
```

Riot API calls run in Rust because the API sends no CORS headers — a `fetch`
from `tauri://localhost` would be blocked. Every account is looked up
concurrently.

Champion names, asset ids and portraits come from Riot's Data Dragon CDN. This
is cache-first and never blocks startup: the cached copy renders immediately, a
background task refreshes at launch, and the UI redraws in place only when
something actually changed. Everything is cached to disk, so the champion grid
works offline. The Data Dragon version is read from `versions.json` rather than
pinned, so a patch cannot orphan the assets.

Portrait freshness is tracked by ETag, which Data Dragon serves as the image's
content hash. While the version is unchanged nothing is requested — asset URLs
are version-scoped and immutable. When the version moves, each cached portrait
is revalidated with a HEAD request and re-fetched only if its ETag changed, so
a visual rework is picked up even though the champion's name and id stay the
same. The version is also appended to the `asset://` URL, otherwise the webview
would keep serving its cached copy of the old art.

## Working on the UI

```bash
npm run dev        # http://localhost:1420 in any browser
npm run shot       # renders the UI to screenshots/ via headless Edge
```

Outside Tauri the frontend falls back to placeholder data (`src/mock.ts`), so
the whole UI can be designed in a normal browser with hot reload — no Rust
rebuild, and no real credentials on screen.

Anything that touches window controls, drag-and-drop, or the asset protocol
must be verified in the built app; a plain browser has neither Tauri's
permission system nor its OS integration, so those paths can pass in the
browser and still fail in the window.

### Things that fail silently

- **Window APIs are permission-gated.** Any `getCurrentWindow()` call needs a
  matching entry in `src-tauri/capabilities/default.json` (`allow-close`,
  `allow-minimize`, `allow-toggle-maximize`, `allow-start-dragging`,
  `allow-destroy`). A missing permission rejects the call with no visible error.
- **HTML5 drag-and-drop needs `dragDropEnabled: false`.** Tauri's OS-level
  file-drop handler otherwise intercepts drag events inside the webview on
  Windows.
- **The asset protocol scope is an absolute path.** Tauri's `$APPDATA` variable
  resolves to `%APPDATA%\<bundle identifier>`, not this app's
  `%APPDATA%\LoLinfo`. A wrong scope makes portraits fall back to the network,
  which looks fine until you are offline.
