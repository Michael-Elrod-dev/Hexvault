# Hexvault

[![CI](https://github.com/Michael-Elrod-dev/Hexvault/actions/workflows/ci.yml/badge.svg)](https://github.com/Michael-Elrod-dev/Hexvault/actions/workflows/ci.yml)

A desktop app for managing League of Legends accounts. Click-to-copy
credentials, live solo-queue ranks, and per-role champion pools.

Tauri 2 (Rust) + React + Tailwind. Windows-focused. It renders in WebView2,
which ships with Windows 11.

## Setup

Download the installer from the
[latest release](https://github.com/Michael-Elrod-dev/Hexvault/releases/latest)
and run it. It installs per-user and does not ask for administrator rights.
SmartScreen will warn about an unknown publisher, so check the SHA-256 in the
release notes before running it.

Rank lookups need your own Riot API key. Sign in at
<https://developer.riotgames.com/> with your Riot account. The key on the
dashboard is a development key and stops working after 24 hours, so register a
personal key instead. Press **Register Product**, choose the personal option,
and describe what you are using it for. A personal key does not expire daily and
allows 20 requests per second, which is far more than this app needs.

Put the key in `%APPDATA%\Hexvault\.env`, as one line.

```
RIOT_API_KEY=RGAPI-your-key-here
```

Restart Hexvault. Accounts and champion pools work without a key. Ranks stay
blank until one is set.

## Running from source

```bash
npm install
cp .env.example .env      # then paste your Riot API key into it
npm run tauri dev
```

## Building

```bash
npm run tauri build
```

Produces `src-tauri/target/release/hexvault.exe` (~5 MB) and an installer under
`src-tauri/target/release/bundle/nsis/`.

The built exe reads `.env` from its own directory or `%APPDATA%\Hexvault\`.
Putting a copy in `%APPDATA%\Hexvault\.env` makes it work no matter where it is
launched from.

## Using it

**Accounts.** Click any riot ID, account name, or password to copy it. The
field flashes and a toast confirms. *Show passwords* unmasks them, *Edit*
reveals per-card reorder / edit / delete controls, and *Add* creates one. Cards
can also be dragged to reorder. Ranks render from cache immediately, then
refresh in the background.

A rank that fails to refresh shows `Error` instead of its cached value. The
reason appears in a toast.

**Champions.** Press `+` on a role, type, and pick from the dropdown. Free text
cannot be submitted, so pool names always match Riot's spelling. The row closes
when you pick or click away. Hover a portrait to remove that champion, drag a
portrait to reorder it within its role, and use the arrows in each heading to
reorder roles themselves. Dragging is confined to one role, so a champion cannot
cross into another pool by accident.

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
| `%APPDATA%\Hexvault\config.json` | Accounts, encrypted credentials, champion pools, window size |
| `%APPDATA%\Hexvault\ranks.json` | Cached ranks |
| `%APPDATA%\Hexvault\champions.json` | Champion names and Data Dragon asset ids |
| `%APPDATA%\Hexvault\portraits\` | Cached champion portraits (~4.6 MB) |
| `%APPDATA%\Hexvault\portraits.json` | ETag of each cached portrait, for revalidation |
| `.env` | `RIOT_API_KEY` only. Gitignored. |

## Security

**Credentials are encrypted to your Windows account.** Logins and passwords in
`%APPDATA%\Hexvault\config.json` are encrypted with Windows DPAPI. Another user
on the same PC, a copy of the file on another machine, a backup, or a disk image
cannot read them. Programs running under your own Windows account can, because
they can ask Windows to decrypt the same way Hexvault does. Do not run Hexvault
on a machine you do not trust.

Because the encryption is tied to your Windows login, a `config.json` copied to
another PC or user will not open. Hexvault keeps the file as
`config.json.unreadable-<timestamp>` and starts empty. There is no export, so
re-enter accounts on the new machine.

**Copying puts the value on the Windows clipboard.** Hexvault marks every copy
as excluded from clipboard history (Win+V) and from cloud clipboard sync, and
clears it after 30 seconds if you have not copied something else. Until then any
running program can read the clipboard.

**The installer is not code-signed.** Windows SmartScreen will show "Unknown
publisher". Choose *More info*, then *Run anyway*. Before you do, compare the
file's SHA-256 with the value in the release notes.

    certutil -hashfile Hexvault_<version>_x64-setup.exe SHA256

The installer is per-user (`%LOCALAPPDATA%\Hexvault`) and does not ask for
administrator rights.

The Riot API key in `.env` is read by the Rust process only and is never written
to `config.json` or shown in the UI.

## How it fits together

Rust owns data and network. React is a pure view layer.

```
src/
  App.tsx                 state, persistence, shortcuts
  api.ts                  Tauri command bridge
  types.ts                shared types, rank parsing, tier colors
  champions.ts            portrait URLs, asset ids, picker search
  styles.css              Tailwind v4 and the design tokens
  components/             AccountsPage, ChampionsPage, AccountDialog,
                          TitleBar, ScrollArea, Portrait, Toast
src-tauri/src/
  config.rs               config + rank cache, .env resolution, atomic writes
  riot.rs                 concurrent Riot API client
  ddragon.rs              champion index + portrait cache, background refresh
  lib.rs                  Tauri commands and window setup
  secret.rs               DPAPI credential encryption
```

Riot API calls run in Rust because the API sends no CORS headers, so a `fetch`
from `tauri://localhost` would be blocked. Every account is looked up
concurrently.

Champion names, asset ids and portraits come from Riot's Data Dragon CDN. This
is cache-first and never blocks startup. The cached copy renders immediately, a
background task refreshes at launch, and the UI redraws in place only when
something actually changed. Everything is cached to disk, so the champion grid
works offline. The Data Dragon version is read from `versions.json` at launch,
so a patch cannot orphan the assets.

Portrait freshness is tracked by ETag, which Data Dragon serves as the image's
content hash. While the version is unchanged nothing is requested, since asset
URLs are version-scoped and immutable. When the version moves, each cached
portrait is revalidated with a HEAD request and re-fetched only if its ETag
changed, so a visual rework is picked up even though the champion's name and id
stay the same. The version is also appended to the `asset://` URL, otherwise the
webview would keep serving its cached copy of the old art.

## Things that fail silently

- **Window APIs are permission-gated.** Any `getCurrentWindow()` or event call
  needs a matching entry in `src-tauri/capabilities/default.json`. A missing
  permission rejects the call with no visible error.
- **HTML5 drag-and-drop needs `dragDropEnabled: false`.** Tauri's OS-level
  file-drop handler otherwise intercepts drag events inside the webview on
  Windows.
- **The asset protocol scope is granted at runtime.** `lib.rs` allows the
  portraits directory during setup, so a portrait that renders online but not
  offline means that grant failed.

## License

MIT. See `LICENSE`.

Hexvault isn't endorsed by Riot Games and doesn't reflect the views or opinions
of Riot Games or anyone officially involved in producing or managing Riot Games
properties. Riot Games, and all associated properties are trademarks or
registered trademarks of Riot Games, Inc.
