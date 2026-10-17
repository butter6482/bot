from types import SimpleNamespace

import pytest
from PIL import Image

from computer_agent.geometry import Geometry


class FakeDesktop:
    """Records calls. Logical 2000x1000 screen captured at native 4000x2000 (HiDPI)."""

    def __init__(self):
        self.calls = []
        self.fail_on = None

    def _rec(self, name, *args):
        if self.fail_on == name:
            raise RuntimeError("boom")
        self.calls.append((name, *args))

    def logical_size(self):
        return 2000, 1000

    def capture(self):
        return Image.new("RGB", (4000, 2000), "white")

    def click(self, x, y, button, clicks, modifiers): self._rec("click", x, y, button, clicks, tuple(modifiers))
    def move(self, x, y): self._rec("move", x, y)
    def drag(self, x0, y0, x1, y1, modifiers): self._rec("drag", x0, y0, x1, y1, tuple(modifiers))
    def mouse_down(self): self._rec("mouse_down")
    def mouse_up(self): self._rec("mouse_up")
    def position(self): return (1000, 500)
    def scroll(self, x, y, direction, amount, modifiers): self._rec("scroll", x, y, direction, amount)
    def type_text(self, text): self._rec("type", text)
    def key(self, keys, repeat): self._rec("key", tuple(keys), repeat)
    def hold_key(self, key, duration): self._rec("hold_key", key, duration)
    def wait(self, duration): self._rec("wait", duration)


def tool_use(i, name, **inp):
    return SimpleNamespace(type="tool_use", id=f"t{i}", name=name, toolset_name="computer", input=inp)


def text(t):
    return SimpleNamespace(type="text", text=t)


class FakeClient:
    """messages.create returns scripted responses in order and records requests."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.requests = []
        self.messages = self

    def create(self, **kw):
        # snapshot: the agent keeps appending to the same messages list
        self.requests.append({**kw, "messages": list(kw["messages"])})
        return self._responses.pop(0)


def response(content, stop_reason="tool_use"):
    return SimpleNamespace(content=content, stop_reason=stop_reason)


@pytest.fixture
def desktop():
    return FakeDesktop()


@pytest.fixture
def geo():
    # long edge 2000 -> max_edge 1000 gives scale 0.5; model sees 1000x500
    return Geometry(2000, 1000, 4000, 2000, max_edge=1000)
