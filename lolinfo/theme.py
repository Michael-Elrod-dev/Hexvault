"""Dark theme: one stylesheet applied once to the app, plus rank colors.

The legacy build drew every rounded corner by hand onto a tk.Canvas per widget.
Qt renders the same look from this stylesheet natively, which is where most of
the widget-construction speedup comes from.
"""
from __future__ import annotations

BG = "#1a1b1e"
SURFACE = "#25262b"
SURFACE_HI = "#2e2f35"
FIELD = "#303138"
BORDER = "#35363c"
TEXT = "#e8e8ea"
MUTED = "#8b8d94"
ACCENT = "#3d7eff"
ACCENT_HI = "#5590ff"
DANGER = "#e5484d"

# Ordered longest-first so "Grandmaster" is matched before "Master".
# The legacy get_rank_color tested "Master" first, so every Grandmaster
# account rendered in Master purple instead of red.
TIER_COLORS: list[tuple[str, str]] = [
    ("Challenger", "#00BFFF"),
    ("Grandmaster", "#FF6B6B"),
    ("Master", "#9932CC"),
    ("Diamond", "#B9F2FF"),
    ("Emerald", "#50C878"),
    ("Platinum", "#00CED1"),
    ("Gold", "#FFD700"),
    ("Silver", "#C0C0C0"),
    ("Bronze", "#CD7F32"),
    ("Iron", "#8B4513"),
]
NEUTRAL = "#888888"


def rank_color(text: str) -> str:
    for tier, color in TIER_COLORS:
        if tier in text:
            return color
    return NEUTRAL


def strip_lp(rank: str) -> str:
    """'Gold II - 45 LP' -> 'Gold II' (cards show tier only, as before)."""
    return rank.split(" \N{BULLET} ")[0] if " \N{BULLET} " in rank else rank


QSS = f"""
QWidget {{
    background: {BG};
    color: {TEXT};
    font-family: "Segoe UI", sans-serif;
    font-size: 13px;
}}
/* Labels must not paint the page background over the card they sit on.
   QLabel#Value re-declares its own background below. */
QLabel {{ background: transparent; }}
QScrollArea, QScrollArea > QWidget > QWidget {{ background: {BG}; border: none; }}
/* Plain container widgets sitting on a card, named so they stay transparent
   without a descendant rule that would also blank out the chips. */
QWidget#Bare {{ background: transparent; }}

QFrame#Card {{
    background: {SURFACE};
    border: 1px solid {BORDER};
    border-radius: 12px;
}}
QLabel#RiotId {{ font-size: 16px; font-weight: 600; }}
QLabel#RiotId:hover {{ color: {ACCENT_HI}; }}
QLabel#Role {{ color: {MUTED}; font-size: 13px; }}
QLabel#Rank {{ font-size: 12px; font-weight: 700; }}
QLabel#FieldLabel {{ color: {MUTED}; font-size: 11px; }}
QLabel#SectionTitle {{ font-size: 20px; font-weight: 700; }}
QLabel#Count {{ color: {MUTED}; font-size: 11px; font-weight: 600; }}

QLabel#Value {{
    background: {FIELD};
    border: 1px solid {BORDER};
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 12px;
}}
QLabel#Value:hover {{ background: {SURFACE_HI}; border-color: {ACCENT}; }}

QPushButton {{
    background: {ACCENT};
    border: none; border-radius: 8px;
    padding: 8px 14px;
    font-size: 12px; font-weight: 600;
}}
QPushButton:hover {{ background: {ACCENT_HI}; }}
QPushButton:pressed {{ background: #2f6ae0; }}
QPushButton:disabled {{ background: {FIELD}; color: {MUTED}; }}

QPushButton#Ghost {{
    background: {FIELD};
    border: 1px solid {BORDER};
    color: {TEXT};
}}
QPushButton#Ghost:hover {{ background: {SURFACE_HI}; border-color: {ACCENT}; }}
QPushButton#Danger {{ background: {DANGER}; }}
QPushButton#Danger:hover {{ background: #f05a5f; }}

/* Small square buttons. These MUST zero the padding: the base QPushButton rule
   has 8px/14px padding, which on a 26x24 button leaves no room for the glyph
   and it renders blank. */
QPushButton#IconGhost, QPushButton#IconDanger {{
    padding: 0px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 700;
}}
QPushButton#IconGhost {{
    background: {FIELD};
    border: 1px solid {BORDER};
    color: {TEXT};
}}
QPushButton#IconGhost:hover {{ background: {SURFACE_HI}; border-color: {ACCENT}; }}
QPushButton#IconGhost:checked {{ background: {ACCENT}; border-color: {ACCENT}; }}
QPushButton#IconDanger {{ background: {DANGER}; border: none; color: #ffffff; }}
QPushButton#IconDanger:hover {{ background: #f05a5f; }}

QPushButton#ChipRemove {{
    background: transparent;
    color: {MUTED};
    border: none; border-radius: 9px;
    padding: 0px;
    font-size: 14px; font-weight: 700;
}}
QPushButton#ChipRemove:hover {{ background: {DANGER}; color: white; }}

QFrame#Chip {{
    background: {FIELD};
    border: 1px solid {BORDER};
    border-radius: 15px;
}}
QFrame#Chip:hover {{ border-color: {ACCENT}; }}
QLabel#ChipName {{ font-size: 12px; font-weight: 600; background: transparent; }}

QLineEdit {{
    background: {FIELD};
    border: 1px solid {BORDER};
    border-radius: 8px;
    padding: 7px 10px;
    selection-background-color: {ACCENT};
}}
QLineEdit:focus {{ border-color: {ACCENT}; }}

QTabWidget::pane {{ border: none; background: {BG}; }}
QTabBar::tab {{
    background: transparent;
    color: {MUTED};
    padding: 9px 22px;
    margin-right: 4px;
    border-radius: 8px;
    font-weight: 600;
}}
QTabBar::tab:selected {{ background: {SURFACE}; color: {TEXT}; }}
QTabBar::tab:hover:!selected {{ color: {TEXT}; }}

QScrollBar:vertical {{ background: transparent; width: 10px; margin: 0; }}
QScrollBar::handle:vertical {{
    background: {BORDER}; border-radius: 5px; min-height: 30px;
}}
QScrollBar::handle:vertical:hover {{ background: #4a4b52; }}
QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; }}
QScrollBar::add-page, QScrollBar::sub-page {{ background: transparent; }}

QFrame#Toast {{
    background: #1e3a1e;
    border: 1px solid #4CAF50;
    border-radius: 10px;
}}
QLabel#ToastText {{ background: transparent; font-weight: 600; }}

QDialog {{ background: {BG}; }}
QLabel#DialogLabel {{ color: {MUTED}; font-size: 11px; }}
"""
