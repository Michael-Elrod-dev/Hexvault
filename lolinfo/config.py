r"""Config + rank-cache persistence.

Everything lives in %APPDATA%\LoLinfo\ so it survives rebuilds and does not
depend on the process working directory (the legacy app used a relative
"data/" path, which is why its live data ended up stranded in dist/data).
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from dataclasses import dataclass, field, asdict
from pathlib import Path

APP_DIR = Path(os.environ.get("APPDATA", Path.home())) / "LoLinfo"
CONFIG_PATH = APP_DIR / "config.json"
RANK_CACHE_PATH = APP_DIR / "ranks.json"

def _search_roots() -> list[Path]:
    """Directories to look for a .env in, nearest first.

    Frozen builds check the directory holding the .exe as well as the unpacked
    bundle, so dropping a .env beside the executable works.
    """
    roots: list[Path] = []
    if getattr(sys, "frozen", False):
        roots.append(Path(sys.executable).resolve().parent)
        bundle = getattr(sys, "_MEIPASS", None)
        if bundle:
            roots.append(Path(bundle))
    else:
        roots.append(Path(__file__).resolve().parent.parent)
    return roots


def _read_dotenv(path: Path) -> dict[str, str]:
    """Minimal KEY=VALUE reader. Avoids a python-dotenv dependency for one key."""
    values: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return values
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def resolve_api_key() -> str:
    """Riot API key, from the environment or a .env file.

    Deliberately never read from or written to config.json, so the key stays
    out of anything that could be committed. Precedence: real environment
    variable, then .env beside the app, then .env in %APPDATA%\\LoLinfo.
    """
    from_env = os.environ.get("RIOT_API_KEY", "").strip()
    if from_env:
        return from_env
    for root in _search_roots() + [APP_DIR]:
        value = _read_dotenv(root / ".env").get("RIOT_API_KEY", "").strip()
        if value:
            return value
    return ""

DEFAULT_POOLS = [
    ("Jungle", "\N{EVERGREEN TREE}", "#4ECDC4"),
    ("Mid", "⚔️", "#FF6B6B"),
    ("Bot", "\N{BOW AND ARROW}", "#45B7D1"),
    ("Top", "⚡", "#FFEAA7"),
    ("Support", "\N{SHIELD}️", "#96CEB4"),
]


def _atomic_write(path: Path, text: str) -> None:
    """Write via a temp file in the same directory, then replace.

    os.replace is atomic on Windows, so a crash mid-write can never leave a
    truncated config behind. The legacy save_champion_pools deleted the real
    file before renaming the temp into place, which had a window where both
    could be missing.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


@dataclass
class Account:
    riot_name: str
    tag: str
    login: str
    password: str
    role: str | None = None

    @property
    def riot_id(self) -> str:
        return f"{self.riot_name}#{self.tag}"

    @property
    def key(self) -> str:
        """Stable identity for rank cache lookups. Riot IDs are case-insensitive."""
        return f"{self.riot_name.lower()}#{self.tag.lower()}"


@dataclass
class Pool:
    role: str
    icon: str
    color: str
    champions: list[str] = field(default_factory=list)


@dataclass
class Config:
    api_key: str = ""
    width: int = 520
    height: int = 900
    x: int | None = None
    y: int | None = None
    passwords_visible: bool = False
    accounts: list[Account] = field(default_factory=list)
    pools: list[Pool] = field(default_factory=list)

    @classmethod
    def load(cls) -> "Config":
        try:
            raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return cls(api_key=resolve_api_key(),
                       pools=[Pool(r, i, c) for r, i, c in DEFAULT_POOLS])

        win = raw.get("window") or {}
        cfg = cls(
            api_key=resolve_api_key(),
            width=int(win.get("width") or 520),
            height=int(win.get("height") or 900),
            x=win.get("x"),
            y=win.get("y"),
            passwords_visible=bool(raw.get("passwords_visible", False)),
        )
        for a in raw.get("accounts") or []:
            try:
                cfg.accounts.append(Account(
                    riot_name=a["riot_name"], tag=a["tag"],
                    login=a.get("login", ""), password=a.get("password", ""),
                    role=a.get("role") or None,
                ))
            except (KeyError, TypeError):
                continue
        for p in raw.get("champion_pools") or []:
            try:
                cfg.pools.append(Pool(
                    role=p["role"], icon=p.get("icon", "\N{VIDEO GAME}"),
                    color=p.get("color", "#888888"),
                    champions=[str(c) for c in (p.get("champions") or [])],
                ))
            except (KeyError, TypeError):
                continue
        if not cfg.pools:
            cfg.pools = [Pool(r, i, c) for r, i, c in DEFAULT_POOLS]
        return cfg

    def save(self) -> None:
        payload = {
            "version": 1,
            "window": {"width": self.width, "height": self.height,
                       "x": self.x, "y": self.y},
            "passwords_visible": self.passwords_visible,
            "accounts": [asdict(a) for a in self.accounts],
            "champion_pools": [asdict(p) for p in self.pools],
        }
        _atomic_write(CONFIG_PATH, json.dumps(payload, indent=2, ensure_ascii=False))


def load_rank_cache() -> dict[str, str]:
    """Ranks from the previous session, so cards render populated immediately."""
    try:
        raw = json.loads(RANK_CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {str(k): str(v) for k, v in raw.items()} if isinstance(raw, dict) else {}


def save_rank_cache(ranks: dict[str, str]) -> None:
    try:
        _atomic_write(RANK_CACHE_PATH, json.dumps(ranks, indent=2, ensure_ascii=False))
    except OSError:
        pass  # a cache write failure must never take the app down
