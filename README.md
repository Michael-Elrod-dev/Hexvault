# LoL-Info

A small desktop app for managing League of Legends accounts: click-to-copy
credentials, live solo-queue ranks, and per-role champion pools.

Built with PySide6 (Qt). Windows-focused, but nothing here is Windows-only
except the default config location.

## Running from source

```bash
pip install -r requirements.txt
cp .env.example .env      # then paste your Riot API key into it
python main.py
```

Get a development API key at <https://developer.riotgames.com/>. Development
keys expire every 24 hours; a personal or production key lasts longer.

## Building the executable

```bash
pyinstaller --clean --noconfirm LoL-Info.spec
cp .env dist/LoL-Info/.env
```

Output lands in `dist/LoL-Info/`. The spec builds **onedir**, not onefile: a
onefile build re-extracts the entire bundle to a temp directory on every launch
before Python starts, which cost the previous build 0.5-2s per start.

## Where your data lives

Nothing is stored in the repo.

| File | Contents |
|---|---|
| `%APPDATA%\LoLinfo\config.json` | Accounts, credentials, champion pools, window size |
| `%APPDATA%\LoLinfo\ranks.json` | Cached ranks, so cards render populated at startup |
| `.env` (repo root or next to the .exe) | `RIOT_API_KEY` only. Gitignored. |

The API key is read from the environment or `.env` and is **never** written to
`config.json`, so no file the repo tracks can contain it.

Precedence: `RIOT_API_KEY` environment variable, then `.env` beside the app,
then `%APPDATA%\LoLinfo\.env`.

## Using it

**Accounts tab.** Click any riot ID, account name, or password to copy it.
*Show Passwords* unmasks them, *Edit* reveals per-card reorder / edit / delete
controls, *+ Add* creates one. Ranks refresh automatically at launch and on
demand via *Refresh* or `Ctrl+R`.

**Champions tab.** Type a champion and press Enter to add it to a role; click
the `×` on a chip to remove it. Changes save automatically after a short pause,
or immediately with `Ctrl+S`.

| Shortcut | Action |
|---|---|
| `Ctrl+R` | Refresh ranks |
| `Ctrl+S` | Save now |

## Layout

```
main.py              entry point
lolinfo/config.py    config + rank cache, .env resolution, atomic writes
lolinfo/theme.py     dark stylesheet and rank colors
lolinfo/riot.py      async Riot API client (QNetworkAccessManager)
lolinfo/widgets.py   FlowLayout, ChampionChip, AccountCard, Toast
lolinfo/window.py    main window and the two pages
lolinfo/dialogs.py   add/edit account dialog
tools/migrate.py     one-time import from the old CustomTkinter build
```

## Notes on the rewrite

This replaces a CustomTkinter version. The changes that mattered for speed:

- **Champion chips reflow instead of rebuilding.** The old tab destroyed and
  reconstructed all ~145 chip widgets on every resize and on the first tab
  switch (~2,050 ms). `FlowLayout` repositions the existing widgets (~18 ms).
- **Rank lookups run concurrently** on the Qt event loop rather than 16
  sequential blocking requests on a worker thread. All 8 accounts resolve in
  about 0.6s.
- **Ranks are cached to disk**, so cards show last known values immediately
  instead of "Loading..." on every launch.
- **No artificial delays.** The old startup path contained ~600 ms of hardcoded
  `after()` sleeps plus a 2,000 ms wait before ranks began loading.
- **onedir packaging** instead of onefile.

One behavioral fix carried over: the old rank colouring tested `"Master" in
text` before `"Grandmaster"`, so Grandmaster accounts rendered in Master purple.
Tiers are now matched longest-first.
