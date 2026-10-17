"""OpenRouter backend: Claude Opus (or any vision + tool-calling model) via the OpenAI-compatible API.

OpenRouter does not forward Anthropic's native `computer_toolset_20260801`, so the computer is exposed
as one ordinary function tool (`computer`, with an `action` enum named after the toolset members).
Screenshots travel as `image_url` data URIs in a user message that follows the tool results.
Everything those screenshots show is sent to OpenRouter and the model provider.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from types import SimpleNamespace
from typing import Any

from .actions import TOOLSET
from .desktop import Desktop
from .geometry import Geometry
from .loop import SYSTEM_PROMPT, RunResult, run_calls
from .safety import ActionLog, Approver, Quit

ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
ACTIONS = [
    "screenshot", "zoom", "left_click", "right_click", "middle_click", "double_click", "triple_click",
    "left_click_drag", "mouse_move", "left_mouse_down", "left_mouse_up", "cursor_position",
    "scroll", "type", "key", "hold_key", "wait",
]

COMPUTER_TOOL = {
    "type": "function",
    "function": {
        "name": TOOLSET,
        "description": (
            "Control the user's computer. Coordinates are pixels in the most recent screenshot, origin top-left. "
            "Always call action=screenshot first. For clicks pass `coordinate` [x, y]; for left_click_drag also "
            "`start_coordinate`; `type` takes `text`; `key` takes `text` like 'Return' or 'ctrl+s' (optional `repeat`); "
            "`scroll` takes scroll_direction (up/down/left/right) and scroll_amount; `zoom` takes region [x0,y0,x1,y1]; "
            "`wait` and `hold_key` take duration in seconds. Click actions accept optional `text` modifiers like 'shift'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ACTIONS},
                "coordinate": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2},
                "start_coordinate": {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2},
                "region": {"type": "array", "items": {"type": "number"}, "minItems": 4, "maxItems": 4},
                "text": {"type": "string"},
                "scroll_direction": {"type": "string", "enum": ["up", "down", "left", "right"]},
                "scroll_amount": {"type": "integer"},
                "duration": {"type": "number"},
                "repeat": {"type": "integer"},
            },
            "required": ["action"],
        },
    },
}


class OpenRouterError(RuntimeError):
    pass


class OpenRouterClient:
    """Minimal stdlib HTTP client: timeout, retry with backoff on 429/5xx. The key stays in memory only."""

    def __init__(self, api_key: str | None = None, timeout: float = 120.0, attempts: int = 3) -> None:
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        if not self.api_key:
            raise OpenRouterError("OPENROUTER_API_KEY is not set.")
        self.timeout, self.attempts = timeout, attempts

    def chat(self, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload).encode()
        last: Exception | None = None
        for attempt in range(1, self.attempts + 1):
            req = urllib.request.Request(
                ENDPOINT, data=body, method="POST",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", "X-Title": "computer-agent"},
            )
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return json.loads(r.read())
            except urllib.error.HTTPError as e:
                last = e
                if e.code != 429 and e.code < 500:
                    raise OpenRouterError(f"OpenRouter rejected the request ({e.code}).") from e
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                last = e
            if attempt < self.attempts:
                time.sleep(0.5 * 2 ** (attempt - 1))
        raise OpenRouterError(f"OpenRouter request failed: {last}")


def _image_url(block: dict[str, Any]) -> str:
    src = block["source"]
    return f"data:{src['media_type']};base64,{src['data']}"


def _tool_message(call_id: str, result: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """tool_result -> (OpenAI `tool` message, image parts that must go in a following user message)."""
    content = result["content"]
    if isinstance(content, str):
        return {"role": "tool", "tool_call_id": call_id, "content": content}, []
    texts = [b["text"] for b in content if b["type"] == "text"]
    images = [{"type": "image_url", "image_url": {"url": _image_url(b)}} for b in content if b["type"] == "image"]
    if images and not texts:
        texts = ["Image attached in the next message."]
    return {"role": "tool", "tool_call_id": call_id, "content": " ".join(texts)}, images


def run_agent_openrouter(
    task: str,
    client: Any,
    desktop: Desktop,
    geo: Geometry,
    approver: Approver,
    *,
    model: str,
    max_steps: int = 30,
    log: ActionLog | None = None,
    verbose: bool = True,
) -> RunResult:
    log = log or ActionLog(None)
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": task},
    ]
    steps = 0
    log.write("start", task=task, model=model, backend="openrouter")

    while steps < max_steps:
        steps += 1
        resp = client.chat({"model": model, "messages": messages, "tools": [COMPUTER_TOOL], "tool_choice": "auto", "max_tokens": 4096})
        try:
            choice = resp["choices"][0]
            msg = choice["message"]
        except (KeyError, IndexError, TypeError) as e:
            raise OpenRouterError(f"Unexpected OpenRouter response: {str(resp)[:200]}") from e
        if resp.get("usage"):
            log.write("usage", **{k: resp["usage"].get(k) for k in ("prompt_tokens", "completion_tokens")})

        text = (msg.get("content") or "").strip()
        tool_calls = msg.get("tool_calls") or []
        assistant: dict[str, Any] = {"role": "assistant", "content": msg.get("content") or ""}
        if tool_calls:
            assistant["tool_calls"] = tool_calls
        messages.append(assistant)
        if verbose and text:
            print(f"\nModel: {text}")

        finish = choice.get("finish_reason")
        if finish == "content_filter":
            return RunResult("refused", text, steps, messages)
        if finish == "length" and tool_calls:
            return RunResult("truncated", text, steps, messages)  # arguments may be cut off: never execute
        if not tool_calls:
            log.write("done", text=text)
            return RunResult("done", text, steps, messages)

        calls = []
        for tc in tool_calls:
            fn = tc.get("function", {})
            try:
                args = json.loads(fn.get("arguments") or "{}")
                if not isinstance(args, dict):
                    raise ValueError
                action = args.pop("action", None) if fn.get("name") == TOOLSET else None
            except ValueError:
                args, action = {}, None
            calls.append(SimpleNamespace(id=tc.get("id"), name=action or "invalid_arguments", input=args))

        try:
            results = run_calls(calls, desktop, geo, approver, log)
        except Quit:
            log.write("quit")
            return RunResult("quit", text, steps, messages)

        images: list[dict[str, Any]] = []
        for call, result in zip(calls, results):
            tool_msg, imgs = _tool_message(call.id, result)
            messages.append(tool_msg)
            images += imgs
        if images:
            messages.append({"role": "user", "content": [{"type": "text", "text": "Screen images from the actions above, in order:"}, *images]})

    log.write("max_steps")
    return RunResult("max_steps", "", steps, messages)
