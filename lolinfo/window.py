"""Main window and the two pages."""
from __future__ import annotations

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QGuiApplication, QKeySequence, QShortcut
from PySide6.QtWidgets import (QFrame, QHBoxLayout, QLabel, QLineEdit,
                               QMessageBox, QPushButton, QScrollArea,
                               QTabWidget, QVBoxLayout, QWidget)

from lolinfo import config as cfg_mod
from lolinfo.config import Account, Config
from lolinfo.dialogs import AccountDialog
from lolinfo.riot import RiotClient
from lolinfo.theme import QSS
from lolinfo.widgets import AccountCard, ChampionChip, FlowLayout, Toast

SAVE_DEBOUNCE_MS = 800


def scroll_column() -> tuple[QScrollArea, QVBoxLayout]:
    """A vertical scroll area plus the layout its content lives in."""
    area = QScrollArea()
    area.setWidgetResizable(True)
    area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
    area.setFrameShape(QFrame.Shape.NoFrame)
    inner = QWidget()
    layout = QVBoxLayout(inner)
    layout.setContentsMargins(2, 2, 8, 12)
    layout.setSpacing(10)
    area.setWidget(inner)
    return area, layout


class AccountsPage(QWidget):
    copied = Signal(str)
    changed = Signal()

    def __init__(self, config: Config, client: RiotClient,
                 parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.config = config
        self.client = client
        self.cards: dict[int, AccountCard] = {}
        self.ranks = cfg_mod.load_rank_cache()
        self._editing = False

        outer = QVBoxLayout(self)
        outer.setContentsMargins(16, 12, 16, 12)
        outer.setSpacing(12)

        bar = QHBoxLayout()
        bar.setSpacing(8)
        outer.addLayout(bar)

        self.passwords_btn = QPushButton()
        self.passwords_btn.setObjectName("Ghost")
        self.passwords_btn.setCheckable(True)
        self.passwords_btn.setChecked(config.passwords_visible)
        self.passwords_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.passwords_btn.toggled.connect(self._set_passwords_visible)
        bar.addWidget(self.passwords_btn)

        self.edit_btn = QPushButton("\N{PENCIL} Edit")
        self.edit_btn.setObjectName("Ghost")
        self.edit_btn.setCheckable(True)
        self.edit_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.edit_btn.setToolTip("Show reorder, edit and delete controls")
        self.edit_btn.toggled.connect(self._set_editing)
        bar.addWidget(self.edit_btn)

        self.add_btn = QPushButton("+ Add")
        self.add_btn.setObjectName("Ghost")
        self.add_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.add_btn.clicked.connect(self.add_account)
        bar.addWidget(self.add_btn)

        bar.addStretch(1)

        self.refresh_btn = QPushButton("\N{CLOCKWISE OPEN CIRCLE ARROW} Refresh")
        self.refresh_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.refresh_btn.clicked.connect(self.refresh_ranks)
        bar.addWidget(self.refresh_btn)

        area, self.column = scroll_column()
        outer.addWidget(area, 1)

        self.empty = QLabel("No accounts yet. Use + Add to create one.")
        self.empty.setObjectName("Role")
        self.empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.column.addWidget(self.empty)
        self.column.addStretch(1)

        client.rank_ready.connect(self._on_rank)
        client.finished.connect(self._on_finished)

        self._set_passwords_visible(config.passwords_visible)
        self.rebuild()

    # -- rendering --------------------------------------------------------
    def rebuild(self) -> None:
        """Recreate the card list. Only called on structural changes, never on resize."""
        for card in self.cards.values():
            card.setParent(None)
            card.deleteLater()
        self.cards.clear()

        for index, account in enumerate(self.config.accounts):
            card = AccountCard(account)
            card.copy_requested.connect(self.copied)
            card.edit_requested.connect(self.edit_account)
            card.delete_requested.connect(self.delete_account)
            card.move_requested.connect(self.move_account)
            card.set_editing(self._editing)
            card.set_passwords_visible(self.config.passwords_visible)
            card.set_rank(self.ranks.get(account.key, "\N{HORIZONTAL ELLIPSIS}"))
            self.column.insertWidget(index, card)
            self.cards[id(account)] = card

        self.empty.setVisible(not self.config.accounts)

    def _set_passwords_visible(self, visible: bool) -> None:
        self.config.passwords_visible = visible
        self.passwords_btn.setText(
            "\N{SEE-NO-EVIL MONKEY} Hide Passwords" if visible else "\N{EYE} Show Passwords")
        for card in self.cards.values():
            card.set_passwords_visible(visible)
        self.changed.emit()

    def _set_editing(self, editing: bool) -> None:
        self._editing = editing
        for card in self.cards.values():
            card.set_editing(editing)

    # -- account CRUD -----------------------------------------------------
    def add_account(self) -> None:
        dialog = AccountDialog(self)
        if dialog.exec():
            self.config.accounts.append(dialog.account())
            self.rebuild()
            self.changed.emit()
            self.refresh_ranks()

    def edit_account(self, account: Account) -> None:
        dialog = AccountDialog(self, account)
        if not dialog.exec():
            return
        updated = dialog.account()
        identity_changed = updated.key != account.key
        account.riot_name = updated.riot_name
        account.tag = updated.tag
        account.login = updated.login
        account.password = updated.password
        account.role = updated.role

        card = self.cards.get(id(account))
        if card:
            card.refresh_static(self.config.passwords_visible)
            card.set_rank(self.ranks.get(account.key, "\N{HORIZONTAL ELLIPSIS}"))
        self.changed.emit()
        if identity_changed:
            self.refresh_ranks()

    def delete_account(self, account: Account) -> None:
        confirm = QMessageBox(self)
        confirm.setWindowTitle("Delete account")
        confirm.setText("Delete " + account.riot_id + "?")
        confirm.setInformativeText("This removes it from the app only.")
        confirm.setStandardButtons(QMessageBox.StandardButton.Cancel
                                   | QMessageBox.StandardButton.Yes)
        confirm.setDefaultButton(QMessageBox.StandardButton.Cancel)
        if confirm.exec() != QMessageBox.StandardButton.Yes:
            return
        self.config.accounts.remove(account)
        self.rebuild()
        self.changed.emit()

    def move_account(self, account: Account, delta: int) -> None:
        accounts = self.config.accounts
        i = accounts.index(account)
        j = i + delta
        if not 0 <= j < len(accounts):
            return
        accounts[i], accounts[j] = accounts[j], accounts[i]
        self.rebuild()
        self.changed.emit()

    # -- ranks ------------------------------------------------------------
    def refresh_ranks(self) -> None:
        if self.client.busy or not self.config.accounts:
            return
        if not self.client.api_key:
            self.refresh_btn.setText("No API key")
            QTimer.singleShot(2000, lambda: self.refresh_btn.setText(
                "\N{CLOCKWISE OPEN CIRCLE ARROW} Refresh"))
            return
        self.refresh_btn.setEnabled(False)
        self.refresh_btn.setText("Refreshing\N{HORIZONTAL ELLIPSIS}")
        for account in self.config.accounts:
            card = self.cards.get(id(account))
            if card and account.key not in self.ranks:
                card.set_rank("\N{HORIZONTAL ELLIPSIS}")
        self.client.fetch_all(self.config.accounts)

    def _on_rank(self, key: str, rank: str) -> None:
        self.ranks[key] = rank
        for account in self.config.accounts:
            if account.key == key:
                card = self.cards.get(id(account))
                if card:
                    card.set_rank(rank)

    def _on_finished(self) -> None:
        cfg_mod.save_rank_cache(self.ranks)
        self.refresh_btn.setEnabled(True)
        self.refresh_btn.setText("\N{CLOCKWISE OPEN CIRCLE ARROW} Refresh")


class ChampionsPage(QWidget):
    changed = Signal()

    def __init__(self, config: Config, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.config = config
        self.flows: dict[str, FlowLayout] = {}
        self.counts: dict[str, QLabel] = {}

        outer = QVBoxLayout(self)
        outer.setContentsMargins(16, 12, 16, 12)
        outer.setSpacing(12)

        bar = QHBoxLayout()
        title = QLabel("Champion Pools")
        title.setObjectName("SectionTitle")
        bar.addWidget(title)
        bar.addStretch(1)
        self.status = QLabel("")
        self.status.setObjectName("Count")
        bar.addWidget(self.status)
        outer.addLayout(bar)

        area, column = scroll_column()
        outer.addWidget(area, 1)
        for pool in config.pools:
            column.addWidget(self._pool_card(pool))
        column.addStretch(1)

    def _pool_card(self, pool) -> QFrame:
        card = QFrame()
        card.setObjectName("Card")
        layout = QVBoxLayout(card)
        layout.setContentsMargins(16, 12, 16, 14)
        layout.setSpacing(10)

        header = QHBoxLayout()
        header.setSpacing(8)
        icon = QLabel(pool.icon)
        icon.setStyleSheet("font-size: 18px;")
        header.addWidget(icon)
        name = QLabel(pool.role.upper())
        name.setStyleSheet("color: " + pool.color + "; font-size: 15px; font-weight: 700;")
        header.addWidget(name)
        header.addStretch(1)
        count = QLabel("")
        count.setObjectName("Count")
        header.addWidget(count)
        layout.addLayout(header)
        self.counts[pool.role] = count

        host = QWidget()
        host.setObjectName("Bare")
        flow = FlowLayout(host)
        layout.addWidget(host)
        self.flows[pool.role] = flow

        row = QHBoxLayout()
        row.setSpacing(8)
        entry = QLineEdit()
        entry.setPlaceholderText("Add a champion\N{HORIZONTAL ELLIPSIS}")
        entry.returnPressed.connect(lambda p=pool, e=entry: self._add(p, e))
        row.addWidget(entry, 1)
        button = QPushButton("+ Add")
        button.setObjectName("Ghost")
        button.setCursor(Qt.CursorShape.PointingHandCursor)
        button.clicked.connect(lambda _=False, p=pool, e=entry: self._add(p, e))
        row.addWidget(button)
        layout.addLayout(row)

        self._render(pool)
        return card

    def _render(self, pool) -> None:
        """Rebuild one pool's chips. Runs on add/remove only, never on resize."""
        flow = self.flows[pool.role]
        flow.clear()
        for champion in pool.champions:
            chip = ChampionChip(champion)
            chip.removed.connect(lambda name, p=pool: self._remove(p, name))
            flow.addWidget(chip)
        flow.invalidate()
        self.counts[pool.role].setText(str(len(pool.champions)) + " champions")

    def _add(self, pool, entry: QLineEdit) -> None:
        name = entry.text().strip()
        if not name:
            return
        if any(c.lower() == name.lower() for c in pool.champions):
            entry.clear()
            return
        pool.champions.append(name)
        entry.clear()
        self._render(pool)
        self._touch()

    def _remove(self, pool, name: str) -> None:
        if name in pool.champions:
            pool.champions.remove(name)
            self._render(pool)
            self._touch()

    def _touch(self) -> None:
        self.status.setText("Saving\N{HORIZONTAL ELLIPSIS}")
        self.changed.emit()

    def mark_saved(self) -> None:
        self.status.setText("Saved \N{CHECK MARK}")
        QTimer.singleShot(1500, lambda: self.status.setText(""))


class MainWindow(QWidget):
    def __init__(self, config: Config) -> None:
        super().__init__()
        self.config = config
        self.setWindowTitle("League Account Manager")
        self.setStyleSheet(QSS)
        self.resize(config.width, config.height)
        if config.x is not None and config.y is not None:
            self.move(config.x, config.y)

        self.client = RiotClient(config.api_key, self)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        self.tabs = QTabWidget()
        layout.addWidget(self.tabs)

        self.accounts_page = AccountsPage(config, self.client)
        self.tabs.addTab(self.accounts_page, "Accounts")

        # The Champions page costs ~150ms to build. Keeping it off the first
        # paint lets the window appear sooner; it is then built during the first
        # idle slice, so it is almost always ready before the tab is clicked.
        self.champions_page: ChampionsPage | None = None
        self._champions_host = QWidget()
        host_layout = QVBoxLayout(self._champions_host)
        host_layout.setContentsMargins(0, 0, 0, 0)
        self.tabs.addTab(self._champions_host, "Champions")
        self.tabs.currentChanged.connect(self._on_tab_changed)

        self.toast = Toast(self)
        self.accounts_page.copied.connect(self.copy_to_clipboard)
        self.accounts_page.changed.connect(self.schedule_save)

        self._save_timer = QTimer(self)
        self._save_timer.setSingleShot(True)
        self._save_timer.timeout.connect(self.save_now)

        QShortcut(QKeySequence("Ctrl+R"), self, self.accounts_page.refresh_ranks)
        QShortcut(QKeySequence("Ctrl+S"), self, self.save_now)

        # Both run once the first frame is on screen, so the window paints
        # immediately rather than waiting on an API round trip or the second tab.
        QTimer.singleShot(0, self.accounts_page.refresh_ranks)
        QTimer.singleShot(0, self._ensure_champions)

    def _ensure_champions(self) -> ChampionsPage:
        if self.champions_page is None:
            self.champions_page = ChampionsPage(self.config)
            self.champions_page.changed.connect(self.schedule_save)
            self._champions_host.layout().addWidget(self.champions_page)
        return self.champions_page

    def _on_tab_changed(self, index: int) -> None:
        if self.tabs.widget(index) is self._champions_host:
            self._ensure_champions()

    def copy_to_clipboard(self, text: str) -> None:
        QGuiApplication.clipboard().setText(text)
        self.toast.show_message("Copied to clipboard")

    def schedule_save(self) -> None:
        self._save_timer.start(SAVE_DEBOUNCE_MS)

    def save_now(self) -> None:
        self._save_timer.stop()
        self.config.width = self.width()
        self.config.height = self.height()
        self.config.x = self.x()
        self.config.y = self.y()
        try:
            self.config.save()
        except OSError as exc:
            self.toast.show_message("Save failed: " + str(exc), 3000)
            return
        if self.champions_page is not None:
            self.champions_page.mark_saved()

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        self.toast.parent_resized()

    def closeEvent(self, event) -> None:
        self.client.cancel()
        self.save_now()
        super().closeEvent(event)
