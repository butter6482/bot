"""Executes one `computer_toolset_20260801` member call against a Desktop and builds its tool_result."""

from __future__ import annotations

import base64
import io
from typing import Any

from PIL import Image

from .desktop import Desktop
from .geometry import Geometry

TOOLSET = "computer"
MAX_WAIT = 300
NOT_EXECUTED = "Not executed: an earlier computer action in this turn failed."

# Members that only observe or pause; everything else can change the machine's state.
SAFE_MEMBERS = {"screenshot", "zoom", "cursor_position", "mouse_move", "wait"}


class ActionError(Exception):
    pass


def _png_block(img: Image.Image) -> dict[str, Any]:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data = base64.standard_b64encode(buf.getvalue()).decode()
    return {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": data}}


def _text(text: str) -> list[dict[str, Any]]:
    return [{"type": "text", "text": text}]


def _modifiers(inp: dict[str, Any]) -> list[str]:
    raw = inp.get("text")
    return [m for m in str(raw).split("+") if m] if raw else []


def _coord(geo: Geometry, value: Any) -> tuple[int, int]:
    try:
        x, y = value
        return geo.to_logical(x, y)
    except (TypeError, ValueError) as e:
        raise ActionError(f"invalid coordinate: {value!r}") from e


def _duration(inp: dict[str, Any]) -> float:
    try:
        d = float(inp.get("duration", 1))
    except (TypeError, ValueError) as e:
        raise ActionError("duration must be a number") from e
    if not 0 <= d <= MAX_WAIT:
        raise ActionError(f"duration must be between 0 and {MAX_WAIT} seconds")
    return d


def take_screenshot(desktop: Desktop, geo: Geometry) -> Image.Image:
    return desktop.capture().resize(geo.model_size, Image.LANCZOS)


def describe(name: str, inp: dict[str, Any]) -> str:
    """Short human-readable line for logs and confirmation prompts."""
    detail = ", ".join(f"{k}={v!r}" for k, v in inp.items())
    return f"{name}({detail})"


def execute(name: str, inp: dict[str, Any], desktop: Desktop, geo: Geometry) -> list[dict[str, Any]]:
    """Run one member call. Returns tool_result `content`. Raises ActionError for bad input."""
    if name == "screenshot":
        return [_png_block(take_screenshot(desktop, geo))]

    if name == "zoom":
        region = inp.get("region")
        if not isinstance(region, (list, tuple)) or len(region) != 4:
            raise ActionError("zoom needs region: [x0, y0, x1, y1]")
        try:
            box = geo.region_to_native(list(region))
        except (TypeError, ValueError) as e:
            raise ActionError(str(e)) from e
        crop = desktop.capture().crop(box)
        longest = max(crop.size)
        if longest > geo.max_edge * 2:  # stay inside the model's image limits
            k = geo.max_edge * 2 / longest
            crop = crop.resize((round(crop.width * k), round(crop.height * k)), Image.LANCZOS)
        return [_png_block(crop)]

    if name in ("left_click", "right_click", "middle_click", "double_click", "triple_click"):
        button = {"left_click": "left", "right_click": "right", "middle_click": "middle"}.get(name, "left")
        clicks = {"double_click": 2, "triple_click": 3}.get(name, 1)
        if inp.get("coordinate") is None:
            desktop.click(None, None, button, clicks, _modifiers(inp))
        else:
            x, y = _coord(geo, inp["coordinate"])
            desktop.click(x, y, button, clicks, _modifiers(inp))
        return _text("OK")

    if name == "mouse_move":
        desktop.move(*_coord(geo, inp.get("coordinate")))
        return _text("OK")

    if name == "left_click_drag":
        x0, y0 = _coord(geo, inp.get("start_coordinate"))
        x1, y1 = _coord(geo, inp.get("coordinate"))
        desktop.drag(x0, y0, x1, y1, _modifiers(inp))
        return _text("OK")

    if name == "left_mouse_down":
        desktop.mouse_down()
        return _text("OK")

    if name == "left_mouse_up":
        desktop.mouse_up()
        return _text("OK")

    if name == "cursor_position":
        x, y = geo.to_model(*desktop.position())
        return _text(f"X={x},Y={y}")

    if name == "scroll":
        direction = inp.get("scroll_direction")
        if direction not in ("up", "down", "left", "right"):
            raise ActionError("scroll_direction must be up, down, left or right")
        try:
            amount = max(1, min(int(inp.get("scroll_amount", 3)), 100))
        except (TypeError, ValueError) as e:
            raise ActionError("scroll_amount must be an integer") from e
        x = y = None
        if inp.get("coordinate") is not None:
            x, y = _coord(geo, inp["coordinate"])
        desktop.scroll(x, y, direction, amount, _modifiers(inp))
        return _text("OK")

    if name == "type":
        text = inp.get("text")
        if not isinstance(text, str) or not text:
            raise ActionError("type needs non-empty text")
        desktop.type_text(text)
        return _text("OK")

    if name == "key":
        combo = inp.get("text")
        if not isinstance(combo, str) or not combo:
            raise ActionError("key needs text such as 'Return' or 'ctrl+s'")
        try:
            repeat = int(inp.get("repeat", 1))
        except (TypeError, ValueError) as e:
            raise ActionError("repeat must be an integer") from e
        if not 1 <= repeat <= 100:
            raise ActionError("repeat must be between 1 and 100")
        desktop.key([k for k in combo.split("+") if k], repeat)
        return _text("OK")

    if name == "hold_key":
        key = inp.get("text")
        if not isinstance(key, str) or not key:
            raise ActionError("hold_key needs text")
        desktop.hold_key(key, _duration(inp))
        return _text("OK")

    if name == "wait":
        desktop.wait(_duration(inp))
        return _text("OK")

    raise ActionError(f"unknown computer action: {name}")
