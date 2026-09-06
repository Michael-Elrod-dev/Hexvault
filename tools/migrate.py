"""One-time migration: pull data out of the legacy CustomTkinter app into config.json.

Uses AST literal extraction rather than importing the old modules, so nothing
executes: no threads spawned, no stray data/ directory created, no network.
"""
import ast, json, os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APPDIR = Path(os.environ["APPDATA"]) / "LoLinfo"


def literals(py_path, names):
    """Return {name: python_value} for every `name = <literal>` assignment found,
    at any nesting depth (module, class body, or inside a method)."""
    tree = ast.parse(py_path.read_text(encoding="utf-8"))
    found = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name):
                key = target.id
            elif isinstance(target, ast.Attribute):
                key = target.attr
            else:
                continue
            if key in names and key not in found:
                try:
                    found[key] = ast.literal_eval(node.value)
                except ValueError:
                    pass
    missing = set(names) - set(found)
    if missing:
        sys.exit(f"FATAL: could not extract {sorted(missing)} from {py_path}")
    return found


def main():
    acct_src = literals(ROOT / "legacy" / "models" / "account_data.py",
                        {"api_key", "accounts", "default_champion_pools"})
    tab_src = literals(ROOT / "legacy" / "ui" / "accounts_tab.py",
                       {"account_roles", "manual_order"})
    champ_src = literals(ROOT / "legacy" / "ui" / "champions_tab.py", {"role_order"})

    accounts_raw = acct_src["accounts"]
    roles = tab_src["account_roles"]
    order = tab_src["manual_order"]

    # Replicate the legacy ordering exactly: manual_order first (skipping any
    # name that no longer exists), then everything else in dict order.
    ordered = [n for n in order if n in accounts_raw]
    ordered += [n for n in accounts_raw if n not in order]

    accounts = []
    for name in ordered:
        d = accounts_raw[name]
        # Legacy displayed data.get('display_name', username); verify it never differed.
        display = d.get("display_name", name)
        if display != name:
            sys.exit(f"FATAL: display_name {display!r} differs from key {name!r}; "
                     "schema needs a separate field")
        accounts.append({
            "riot_name": name,
            "tag": d["tag"],
            "login": d["account_name"],
            "password": d["password"],
            "role": roles.get(name),
        })

    # Live pools (dist/data) win over the stale source defaults.
    live = ROOT / "dist" / "data" / "champion_pools.json"
    pools_raw = acct_src["default_champion_pools"]
    source = "source defaults"
    if live.exists():
        disk = json.loads(live.read_text(encoding="utf-8"))
        merged = {r: dict(v) for r, v in pools_raw.items()}
        for role, data in disk.items():
            if role in merged and isinstance(data, dict):
                merged[role].update({k: v for k, v in data.items()
                                     if k in ("champions", "color", "icon")})
        pools_raw = merged
        source = str(live)

    role_order = champ_src["role_order"]
    role_order += [r for r in pools_raw if r not in role_order]

    pools = []
    for role in role_order:
        d = pools_raw[role]
        pools.append({
            "role": role,
            "icon": d["icon"],
            "color": d["color"],
            "champions": [c.strip() for c in d["champions"].split(",") if c.strip()],
        })

    config = {
        "version": 1,
        "api_key": acct_src["api_key"],
        "window": {"width": 520, "height": 900, "x": None, "y": None},
        "passwords_visible": False,
        "accounts": accounts,
        "champion_pools": pools,
    }

    APPDIR.mkdir(parents=True, exist_ok=True)
    out = APPDIR / "config.json"
    if out.exists():
        sys.exit(f"REFUSING: {out} already exists. Delete it first to re-migrate.")
    out.write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"champion pools read from: {source}")
    print(f"wrote {out}\n")
    print(f"{len(accounts)} accounts, in render order:")
    for i, a in enumerate(accounts, 1):
        print(f"  {i}. {a['riot_name']}#{a['tag']}  login={a['login']}  "
              f"role={a['role'] or '-'}  pw={'*' * len(a['password'])}")
    print(f"\n{len(pools)} champion pools:")
    for p in pools:
        print(f"  {p['icon']} {p['role']:<8} {p['color']}  "
              f"{len(p['champions'])} champs: {', '.join(p['champions'])}")


if __name__ == "__main__":
    main()
