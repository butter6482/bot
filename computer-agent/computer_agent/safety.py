"""Guardrails: human approval before consequential actions, plus an action log."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Callable

from .actions import SAFE_MEMBERS, describe


class Quit(Exception):
    """The user chose to stop the whole run."""


class Approver:
    """Asks the human before a batch that contains a state-changing action.

    ask(prompt) -> 'y' (this batch), 'n' (decline), 'a' (approve everything from now on), 'q' (quit).
    """

    def __init__(self, auto_approve: bool = False, ask: Callable[[str], str] | None = None) -> None:
        self.auto_approve = auto_approve
        self._ask = ask or (lambda p: input(p))

    def approve(self, calls: list[tuple[str, dict]]) -> bool:
        risky = [(n, i) for n, i in calls if n not in SAFE_MEMBERS]
        if not risky or self.auto_approve:
            return True
        lines = "\n".join(f"  - {describe(n, i)}" for n, i in risky)
        while True:
            answer = self._ask(f"\nClaude wants to:\n{lines}\nAllow? [y]es / [n]o / [a]lways / [q]uit: ").strip().lower()
            if answer in ("y", "yes"):
                return True
            if answer in ("n", "no"):
                return False
            if answer in ("a", "always"):
                self.auto_approve = True
                return True
            if answer in ("q", "quit"):
                raise Quit()


class ActionLog:
    def __init__(self, path: str | None) -> None:
        self.path = Path(path) if path else None
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, event: str, **fields) -> None:
        if not self.path:
            return
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"t": time.time(), "event": event, **fields}, default=str) + "\n")
