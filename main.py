"""League Account Manager - entry point."""
from __future__ import annotations

import sys

from PySide6.QtWidgets import QApplication

from lolinfo.config import Config
from lolinfo.window import MainWindow


def main() -> int:
    app = QApplication(sys.argv)
    app.setApplicationName("League Account Manager")
    window = MainWindow(Config.load())
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
