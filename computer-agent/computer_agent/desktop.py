"""Desktop backends. `Desktop` is the small surface the agent needs; `PyAutoGuiDesktop` is the real one."""

from __future__ import annotations

import sys
import time
from typing import Protocol

from PIL import Image

KEY_ALIASES = {
    "return": "enter", "escape": "esc", "super": "win", "super_l": "win", "meta": "win",
    "cmd": "command", "control": "ctrl", "page_up": "pageup", "page_down": "pagedown",
    "prior": "pageup", "next": "pagedown", "backspace": "backspace", "caps_lock": "capslock",
    "arrow_up": "up", "arrow_down": "down", "arrow_left": "left", "arrow_right": "right",
}


def normalize_key(name: str) -> str:
    k = name.strip().lower()
    return KEY_ALIASES.get(k, k)


class Desktop(Protocol):
    def logical_size(self) -> tuple[int, int]: ...
    def capture(self) -> Image.Image: ...  # native resolution
    def click(self, x: int, y: int | None, button: str, clicks: int, modifiers: list[str]) -> None: ...
    def move(self, x: int, y: int) -> None: ...
    def drag(self, x0: int, y0: int, x1: int, y1: int, modifiers: list[str]) -> None: ...
    def mouse_down(self) -> None: ...
    def mouse_up(self) -> None: ...
    def position(self) -> tuple[int, int]: ...
    def scroll(self, x: int | None, y: int | None, direction: str, amount: int, modifiers: list[str]) -> None: ...
    def type_text(self, text: str) -> None: ...
    def key(self, keys: list[str], repeat: int) -> None: ...
    def hold_key(self, key: str, duration: float) -> None: ...
    def wait(self, duration: float) -> None: ...


class PyAutoGuiDesktop:
    """Controls the real screen. Failsafe is ON: slam the mouse into a screen corner to abort."""

    def __init__(self) -> None:
        import pyautogui  # imported lazily: needs a display, so tests never import it

        pyautogui.FAILSAFE = True
        pyautogui.PAUSE = 0.05
        self.g = pyautogui

    def logical_size(self) -> tuple[int, int]:
        s = self.g.size()
        return int(s.width), int(s.height)

    def capture(self) -> Image.Image:
        return self.g.screenshot().convert("RGB")

    def _held(self, modifiers: list[str]):
        class _Ctx:
            def __enter__(s):
                for m in modifiers:
                    self.g.keyDown(normalize_key(m))

            def __exit__(s, *exc):
                for m in reversed(modifiers):
                    self.g.keyUp(normalize_key(m))

        return _Ctx()

    def click(self, x, y, button, clicks, modifiers):
        with self._held(modifiers):
            if x is None:
                self.g.click(button=button, clicks=clicks, interval=0.08)
            else:
                self.g.click(x, y, button=button, clicks=clicks, interval=0.08)

    def move(self, x, y):
        self.g.moveTo(x, y, duration=0.15)

    def drag(self, x0, y0, x1, y1, modifiers):
        with self._held(modifiers):
            self.g.moveTo(x0, y0, duration=0.1)
            self.g.dragTo(x1, y1, duration=0.4, button="left")

    def mouse_down(self):
        self.g.mouseDown()

    def mouse_up(self):
        self.g.mouseUp()

    def position(self):
        p = self.g.position()
        return int(p.x), int(p.y)

    def scroll(self, x, y, direction, amount, modifiers):
        if x is not None:
            self.g.moveTo(x, y, duration=0.1)
        with self._held(modifiers):
            if direction in ("up", "down"):
                self.g.scroll(amount if direction == "up" else -amount)
            else:
                self.g.hscroll(amount if direction == "right" else -amount)

    def type_text(self, text):
        if text.isascii():
            self.g.write(text, interval=0.01)
            return
        try:
            import pyperclip  # optional: `pip install .[unicode]`
        except ImportError as e:
            raise RuntimeError("typing non-ASCII text needs `pip install pyperclip`") from e
        previous = pyperclip.paste()
        pyperclip.copy(text)
        self.g.hotkey("command" if sys.platform == "darwin" else "ctrl", "v")
        time.sleep(0.1)
        pyperclip.copy(previous)

    def key(self, keys, repeat):
        for _ in range(repeat):
            self.g.hotkey(*[normalize_key(k) for k in keys])

    def hold_key(self, key, duration):
        k = normalize_key(key)
        self.g.keyDown(k)
        try:
            time.sleep(duration)
        finally:
            self.g.keyUp(k)

    def wait(self, duration):
        time.sleep(duration)
