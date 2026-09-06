"""Async Riot API client built on Qt's network stack.

QNetworkAccessManager runs the requests on the Qt event loop, so all accounts
resolve concurrently on a single thread and results arrive as signals already
on the GUI thread. That removes every thread, lock, and after(0) marshal the
legacy client needed, and drops the `requests` import (~300ms of startup).
"""
from __future__ import annotations

from urllib.parse import quote

from PySide6.QtCore import QObject, QUrl, Signal
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkReply, QNetworkRequest

ACCOUNT_URL = "https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{}/{}"
LEAGUE_URL = "https://na1.api.riotgames.com/lol/league/v4/entries/by-puuid/{}"
TIMEOUT_MS = 10_000


class RiotClient(QObject):
    """Resolves Riot IDs to solo-queue rank strings."""

    rank_ready = Signal(str, str)   # account key, rank text
    finished = Signal()             # all in-flight lookups settled

    def __init__(self, api_key: str, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.api_key = api_key
        self._nam = QNetworkAccessManager(self)
        self._pending = 0
        self._active: list[QNetworkReply] = []

    def set_api_key(self, key: str) -> None:
        self.api_key = key

    @property
    def busy(self) -> bool:
        return self._pending > 0

    def _request(self, url: str) -> QNetworkRequest:
        req = QNetworkRequest(QUrl(url))
        req.setRawHeader(b"X-Riot-Token", self.api_key.encode())
        req.setTransferTimeout(TIMEOUT_MS)
        req.setAttribute(QNetworkRequest.Attribute.RedirectPolicyAttribute,
                         QNetworkRequest.RedirectPolicy.NoLessSafeRedirectPolicy)
        return req

    def fetch_all(self, accounts) -> None:
        """Start a lookup for every account. No-op while one is already running."""
        if self._pending or not self.api_key:
            return
        accounts = list(accounts)
        if not accounts:
            self.finished.emit()
            return
        self._pending = len(accounts)
        for acct in accounts:
            self._fetch_puuid(acct)

    def cancel(self) -> None:
        for reply in list(self._active):
            reply.abort()
        self._active.clear()
        self._pending = 0

    def _track(self, reply: QNetworkReply, handler) -> None:
        self._active.append(reply)

        def done() -> None:
            if reply in self._active:
                self._active.remove(reply)
            try:
                handler(reply)
            finally:
                reply.deleteLater()

        reply.finished.connect(done)

    def _settle(self, key: str, rank: str) -> None:
        self.rank_ready.emit(key, rank)
        self._pending -= 1
        if self._pending <= 0:
            self._pending = 0
            self.finished.emit()

    @staticmethod
    def _status(reply: QNetworkReply) -> int:
        code = reply.attribute(QNetworkRequest.Attribute.HttpStatusCodeAttribute)
        return int(code) if code else 0

    @staticmethod
    def _describe(status: int, reply: QNetworkReply, stage: str) -> str | None:
        """Map a non-200 response to display text, or None if it succeeded."""
        if status == 200:
            return None
        if status == 404:
            return "Account Not Found" if stage == "account" else "Unranked"
        if status == 429:
            return "Rate Limited"
        if status in (401, 403):
            return "Invalid API Key"
        if status:
            return f"API Error ({status})"
        if reply.error() == QNetworkReply.NetworkError.OperationCanceledError:
            return "Timed Out"
        return "Connection Error"

    def _fetch_puuid(self, acct) -> None:
        url = ACCOUNT_URL.format(quote(acct.riot_name, safe=""), quote(acct.tag, safe=""))
        reply = self._nam.get(self._request(url))

        def handle(r: QNetworkReply) -> None:
            problem = self._describe(self._status(r), r, "account")
            if problem:
                self._settle(acct.key, problem)
                return
            try:
                import json
                puuid = json.loads(bytes(r.readAll().data()).decode("utf-8"))["puuid"]
            except (ValueError, KeyError, TypeError, UnicodeDecodeError):
                self._settle(acct.key, "Data Parse Error")
                return
            self._fetch_rank(acct, puuid)

        self._track(reply, handle)

    def _fetch_rank(self, acct, puuid: str) -> None:
        reply = self._nam.get(self._request(LEAGUE_URL.format(quote(puuid, safe=""))))

        def handle(r: QNetworkReply) -> None:
            problem = self._describe(self._status(r), r, "league")
            if problem:
                self._settle(acct.key, problem)
                return
            try:
                import json
                entries = json.loads(bytes(r.readAll().data()).decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                self._settle(acct.key, "Data Parse Error")
                return
            self._settle(acct.key, self._solo_rank(entries))

        self._track(reply, handle)

    @staticmethod
    def _solo_rank(entries) -> str:
        if not isinstance(entries, list):
            return "Data Parse Error"
        for e in entries:
            if isinstance(e, dict) and e.get("queueType") == "RANKED_SOLO_5x5":
                try:
                    return (f"{str(e['tier']).title()} {e['rank']} "
                            f"\N{BULLET} {e['leaguePoints']} LP")
                except KeyError:
                    return "Data Parse Error"
        return "Unranked"
