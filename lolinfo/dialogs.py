"""Account add/edit dialog."""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QComboBox, QDialog, QDialogButtonBox, QFormLayout,
                               QHBoxLayout, QLabel, QLineEdit, QPushButton,
                               QVBoxLayout, QWidget)

from lolinfo.config import Account

ROLES = ["", "TOP", "JG", "MID", "ADC", "SUP"]


class AccountDialog(QDialog):
    """Collects the five account fields. Returns a new/updated Account."""

    def __init__(self, parent: QWidget | None = None, account: Account | None = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Edit Account" if account else "Add Account")
        self.setModal(True)
        self.setMinimumWidth(360)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(20, 18, 20, 16)
        outer.setSpacing(14)

        form = QFormLayout()
        form.setSpacing(10)
        form.setLabelAlignment(Qt.AlignmentFlag.AlignLeft)
        outer.addLayout(form)

        self.riot_name = QLineEdit(account.riot_name if account else "")
        self.riot_name.setPlaceholderText("Summoner name (before the #)")
        self.tag = QLineEdit(account.tag if account else "NA1")
        self.tag.setPlaceholderText("NA1")
        self.login = QLineEdit(account.login if account else "")
        self.login.setPlaceholderText("Login username")
        self.password = QLineEdit(account.password if account else "")
        self.password.setEchoMode(QLineEdit.EchoMode.Password)

        pw_row = QWidget()
        pw_layout = QHBoxLayout(pw_row)
        pw_layout.setContentsMargins(0, 0, 0, 0)
        pw_layout.setSpacing(6)
        pw_layout.addWidget(self.password, 1)
        reveal = QPushButton("\N{EYE}")
        reveal.setObjectName("IconGhost")
        reveal.setFixedSize(34, 32)
        reveal.setCheckable(True)
        reveal.setCursor(Qt.CursorShape.PointingHandCursor)
        reveal.setToolTip("Show password")
        reveal.toggled.connect(
            lambda on: self.password.setEchoMode(
                QLineEdit.EchoMode.Normal if on else QLineEdit.EchoMode.Password))
        pw_layout.addWidget(reveal)

        self.role = QComboBox()
        self.role.addItems(ROLES)
        self.role.setCurrentText(account.role or "" if account else "")

        for caption, widget in (("Riot name", self.riot_name), ("Tag", self.tag),
                                ("Account name", self.login), ("Password", pw_row),
                                ("Role", self.role)):
            label = QLabel(caption.upper())
            label.setObjectName("DialogLabel")
            form.addRow(label, widget)

        self.error = QLabel("")
        self.error.setStyleSheet("color: #e5484d; font-size: 11px;")
        self.error.setVisible(False)
        outer.addWidget(self.error)

        buttons = QDialogButtonBox(QDialogButtonBox.StandardButton.Save
                                   | QDialogButtonBox.StandardButton.Cancel)
        buttons.button(QDialogButtonBox.StandardButton.Cancel).setObjectName("Ghost")
        buttons.accepted.connect(self._accept)
        buttons.rejected.connect(self.reject)
        outer.addWidget(buttons)

        self.riot_name.setFocus()

    def _accept(self) -> None:
        if not self.riot_name.text().strip():
            self._fail("Riot name is required.")
            return
        if not self.tag.text().strip():
            self._fail("Tag is required (for example NA1).")
            return
        self.accept()

    def _fail(self, message: str) -> None:
        self.error.setText(message)
        self.error.setVisible(True)

    def account(self) -> Account:
        return Account(
            riot_name=self.riot_name.text().strip(),
            tag=self.tag.text().strip().lstrip("#"),
            login=self.login.text().strip(),
            password=self.password.text(),
            role=self.role.currentText().strip() or None,
        )
