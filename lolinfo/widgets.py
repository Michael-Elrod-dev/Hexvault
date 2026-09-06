"""Reusable widgets: flow layout, champion chip, account card, toast."""
from __future__ import annotations

from PySide6.QtCore import (QEasingCurve, QPoint, QPropertyAnimation, QRect,
                            QSize, Qt, QTimer, Signal)
from PySide6.QtWidgets import (QFrame, QGraphicsOpacityEffect, QHBoxLayout,
                               QLabel, QLayout, QPushButton, QSizePolicy,
                               QVBoxLayout, QWidget)

from lolinfo.theme import rank_color, strip_lp

DOTS = "\N{BULLET}" * 8


class FlowLayout(QLayout):
    """Left-to-right layout that wraps to a new line when it runs out of width.

    This is what makes resizing cheap: on a width change Qt calls setGeometry
    and the existing chips are simply repositioned. The legacy tab destroyed
    and reconstructed every chip on each resize (~2s); this is ~18ms.
    """

    def __init__(self, parent: QWidget | None = None, spacing: int = 8) -> None:
        super().__init__(parent)
        self._items: list = []
        self.setSpacing(spacing)
        self.setContentsMargins(0, 0, 0, 0)

    # -- QLayout plumbing -------------------------------------------------
    def addItem(self, item) -> None:
        self._items.append(item)

    def count(self) -> int:
        return len(self._items)

    def itemAt(self, i: int):
        return self._items[i] if 0 <= i < len(self._items) else None

    def takeAt(self, i: int):
        return self._items.pop(i) if 0 <= i < len(self._items) else None

    def expandingDirections(self) -> Qt.Orientations:
        return Qt.Orientations(0)

    def hasHeightForWidth(self) -> bool:
        return True

    def heightForWidth(self, width: int) -> int:
        return self._arrange(QRect(0, 0, width, 0), apply=False)

    def setGeometry(self, rect: QRect) -> None:
        super().setGeometry(rect)
        self._arrange(rect, apply=True)

    def sizeHint(self) -> QSize:
        return self.minimumSize()

    def minimumSize(self) -> QSize:
        size = QSize()
        for item in self._items:
            size = size.expandedTo(item.minimumSize())
        m = self.contentsMargins()
        return size + QSize(m.left() + m.right(), m.top() + m.bottom())

    def _arrange(self, rect: QRect, apply: bool) -> int:
        m = self.contentsMargins()
        x = rect.x() + m.left()
        y = rect.y() + m.top()
        right = rect.right() - m.right()
        spacing = self.spacing()
        line_height = 0
        for item in self._items:
            hint = item.sizeHint()
            next_x = x + hint.width() + spacing
            if next_x - spacing > right + 1 and line_height > 0:
                x = rect.x() + m.left()
                y += line_height + spacing
                next_x = x + hint.width() + spacing
                line_height = 0
            if apply:
                item.setGeometry(QRect(QPoint(x, y), hint))
            x = next_x
            line_height = max(line_height, hint.height())
        return y + line_height - rect.y() + m.bottom()

    def clear(self) -> None:
        while self._items:
            item = self._items.pop()
            w = item.widget()
            if w is not None:
                w.setParent(None)
                w.deleteLater()


class ChampionChip(QFrame):
    """A champion pill sized to its own text, with a remove button."""

    removed = Signal(str)

    def __init__(self, name: str, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.name = name
        self.setObjectName("Chip")
        self.setFixedHeight(32)
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)

        row = QHBoxLayout(self)
        row.setContentsMargins(12, 0, 6, 0)
        row.setSpacing(6)

        label = QLabel(name)
        label.setObjectName("ChipName")
        row.addWidget(label)

        btn = QPushButton("\N{MULTIPLICATION SIGN}")
        btn.setObjectName("ChipRemove")
        btn.setFixedSize(18, 18)
        btn.setCursor(Qt.CursorShape.PointingHandCursor)
        btn.setToolTip("Remove " + name)
        btn.clicked.connect(lambda: self.removed.emit(self.name))
        row.addWidget(btn)


class CopyLabel(QLabel):
    """Click-to-copy value. The hover state is styled in the QSS."""

    clicked = Signal(str)

    def __init__(self, text: str, payload: str | None = None,
                 object_name: str = "Value", parent: QWidget | None = None) -> None:
        super().__init__(text, parent)
        self.setObjectName(object_name)
        self._payload = payload if payload is not None else text
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setToolTip("Click to copy")

    def set_payload(self, payload: str) -> None:
        self._payload = payload

    def mouseReleaseEvent(self, event) -> None:
        inside = self.rect().contains(event.position().toPoint())
        if event.button() == Qt.MouseButton.LeftButton and inside:
            self.clicked.emit(self._payload)
        super().mouseReleaseEvent(event)


class AccountCard(QFrame):
    """One account: riot ID, role, rank, login and password, plus edit controls."""

    copy_requested = Signal(str)
    edit_requested = Signal(object)
    delete_requested = Signal(object)
    move_requested = Signal(object, int)

    def __init__(self, account, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.account = account
        self.setObjectName("Card")

        outer = QVBoxLayout(self)
        outer.setContentsMargins(16, 12, 16, 14)
        outer.setSpacing(10)

        header = QHBoxLayout()
        header.setSpacing(6)
        outer.addLayout(header)

        self.riot_label = CopyLabel("", object_name="RiotId")
        self.riot_label.clicked.connect(self.copy_requested)
        header.addWidget(self.riot_label)

        self.role_label = QLabel("")
        self.role_label.setObjectName("Role")
        header.addWidget(self.role_label)
        header.addStretch(1)

        self.rank_label = QLabel("\N{HORIZONTAL ELLIPSIS}")
        self.rank_label.setObjectName("Rank")
        header.addWidget(self.rank_label)

        self.controls = QWidget()
        self.controls.setObjectName("Bare")
        controls = QHBoxLayout(self.controls)
        controls.setContentsMargins(6, 0, 0, 0)
        controls.setSpacing(4)
        buttons = (
            ("\N{UPWARDS ARROW}", "Move up", "IconGhost",
             lambda: self.move_requested.emit(self.account, -1)),
            ("\N{DOWNWARDS ARROW}", "Move down", "IconGhost",
             lambda: self.move_requested.emit(self.account, 1)),
            ("\N{PENCIL}", "Edit account", "IconGhost",
             lambda: self.edit_requested.emit(self.account)),
            ("\N{MULTIPLICATION SIGN}", "Delete account", "IconDanger",
             lambda: self.delete_requested.emit(self.account)),
        )
        for glyph, tip, style, slot in buttons:
            b = QPushButton(glyph)
            b.setObjectName(style)
            b.setFixedSize(26, 24)
            b.setCursor(Qt.CursorShape.PointingHandCursor)
            b.setToolTip(tip)
            b.clicked.connect(slot)
            controls.addWidget(b)
        self.controls.setVisible(False)
        header.addWidget(self.controls)

        fields = QHBoxLayout()
        fields.setSpacing(10)
        outer.addLayout(fields)
        self.login_value = self._field(fields, "ACCOUNT NAME")
        self.password_value = self._field(fields, "PASSWORD")

        self.refresh_static()

    def _field(self, parent_layout: QHBoxLayout, caption: str) -> CopyLabel:
        col = QVBoxLayout()
        col.setSpacing(4)
        label = QLabel(caption)
        label.setObjectName("FieldLabel")
        col.addWidget(label)
        value = CopyLabel("")
        value.clicked.connect(self.copy_requested)
        col.addWidget(value)
        parent_layout.addLayout(col, 1)
        return value

    def refresh_static(self, passwords_visible: bool = False) -> None:
        """Re-read display state from the account (after an edit)."""
        a = self.account
        self.riot_label.setText(a.riot_id)
        self.riot_label.set_payload(a.riot_id)
        self.role_label.setText("\N{EN DASH} " + a.role if a.role else "")
        self.role_label.setVisible(bool(a.role))
        self.login_value.setText(a.login)
        self.login_value.set_payload(a.login)
        self.set_passwords_visible(passwords_visible)

    def set_passwords_visible(self, visible: bool) -> None:
        self.password_value.setText(self.account.password if visible else DOTS)
        self.password_value.set_payload(self.account.password)

    def set_rank(self, rank: str) -> None:
        shown = strip_lp(rank)
        self.rank_label.setText(shown)
        self.rank_label.setStyleSheet("color: " + rank_color(shown) + ";")
        self.rank_label.setToolTip(rank if rank != shown else "")

    def set_editing(self, editing: bool) -> None:
        self.controls.setVisible(editing)


class Toast(QWidget):
    """Transient confirmation drawn as a child of the window (no extra top-level)."""

    def __init__(self, parent: QWidget) -> None:
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)

        frame = QFrame(self)
        frame.setObjectName("Toast")
        row = QHBoxLayout(frame)
        row.setContentsMargins(16, 9, 16, 9)
        row.setSpacing(9)
        tick = QLabel("\N{CHECK MARK}")
        tick.setObjectName("ToastText")
        tick.setStyleSheet("color: #4CAF50; font-size: 14px;")
        row.addWidget(tick)
        self._text = QLabel("")
        self._text.setObjectName("ToastText")
        row.addWidget(self._text)

        wrap = QVBoxLayout(self)
        wrap.setContentsMargins(0, 0, 0, 0)
        wrap.addWidget(frame)

        self._effect = QGraphicsOpacityEffect(self)
        self._effect.setOpacity(0.0)
        self.setGraphicsEffect(self._effect)

        self._fade = QPropertyAnimation(self._effect, b"opacity", self)
        self._fade.setDuration(140)
        self._fade.setEasingCurve(QEasingCurve.Type.InOutQuad)

        self._hide_timer = QTimer(self)
        self._hide_timer.setSingleShot(True)
        self._hide_timer.timeout.connect(self._fade_out)
        # Connected once and gated by a flag; repeatedly connecting/disconnecting
        # the same slot makes PySide warn when there is nothing attached yet.
        self._fade.finished.connect(self._on_fade_finished)
        self._fading_out = False

        self.hide()

    def _on_fade_finished(self) -> None:
        if self._fading_out:
            self._fading_out = False
            self.hide()

    def show_message(self, message: str, duration_ms: int = 1600) -> None:
        self._text.setText(message)
        self.adjustSize()
        self._reposition()
        self.show()
        self.raise_()
        self._fading_out = False
        self._fade.stop()
        self._fade.setStartValue(self._effect.opacity())
        self._fade.setEndValue(1.0)
        self._fade.start()
        self._hide_timer.start(duration_ms)

    def _fade_out(self) -> None:
        self._fade.stop()
        self._fade.setStartValue(self._effect.opacity())
        self._fade.setEndValue(0.0)
        self._fading_out = True
        self._fade.start()

    def _reposition(self) -> None:
        p = self.parentWidget()
        if p:
            self.move((p.width() - self.width()) // 2,
                      p.height() - self.height() - 26)

    def parent_resized(self) -> None:
        if self.isVisible():
            self._reposition()
