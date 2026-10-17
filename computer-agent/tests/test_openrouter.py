import base64
import io
import json

import pytest

from computer_agent.cli import load_dotenv
from computer_agent.loop import ActionLog
from computer_agent.openrouter import COMPUTER_TOOL, OpenRouterClient, OpenRouterError, run_agent_openrouter
from computer_agent.safety import Approver

from conftest import FakeDesktop  # noqa: F401


class FakeOR:
    def __init__(self, replies):
        self.replies, self.requests = list(replies), []

    def chat(self, payload):
        self.requests.append({**payload, "messages": list(payload["messages"])})
        return self.replies.pop(0)


def call(i, action=None, raw=None, **args):
    a = raw if raw is not None else json.dumps({"action": action, **args})
    return {"id": f"c{i}", "type": "function", "function": {"name": "computer", "arguments": a}}


def reply(content=None, calls=None, finish="tool_calls"):
    msg = {"role": "assistant", "content": content}
    if calls:
        msg["tool_calls"] = calls
    return {"choices": [{"message": msg, "finish_reason": finish}], "usage": {"prompt_tokens": 1, "completion_tokens": 1}}


def run(replies, desktop, geo, **kw):
    c = FakeOR(replies)
    return c, run_agent_openrouter("do it", c, desktop, geo, Approver(auto_approve=True), model="anthropic/test", verbose=False, **kw)


def test_tool_schema_exposes_every_member_action():
    enum = COMPUTER_TOOL["function"]["parameters"]["properties"]["action"]["enum"]
    assert len(enum) == 17 and {"screenshot", "left_click", "zoom", "key"} <= set(enum)


def test_full_loop_images_follow_tool_messages(desktop, geo):
    c, r = run([
        reply("look", [call(1, "screenshot")]),
        reply(None, [call(2, "left_click", coordinate=[100, 50]), call(3, "screenshot")]),
        reply("done!", finish="stop"),
    ], desktop, geo)
    assert r.status == "done" and r.final_text == "done!" and r.steps == 3
    assert ("click", 200, 100, "left", 1, ()) in desktop.calls
    req = c.requests[0]
    assert req["model"] == "anthropic/test" and req["tools"] == [COMPUTER_TOOL] and req["messages"][0]["role"] == "system"
    m = c.requests[1]["messages"]
    assert m[-2]["role"] == "tool" and m[-2]["tool_call_id"] == "c1" and "attached" in m[-2]["content"]
    assert m[-1]["role"] == "user"
    url = m[-1]["content"][1]["image_url"]["url"]
    assert url.startswith("data:image/png;base64,") and base64.b64decode(url.split(",")[1])[:4] == b"\x89PNG"
    # both calls of a turn are answered with tool messages before the images
    tail = c.requests[2]["messages"]
    assert [x["role"] for x in tail[-3:]] == ["tool", "tool", "user"]
    assert {x["tool_call_id"] for x in tail if x["role"] == "tool"} >= {"c1", "c2", "c3"}


def test_invalid_arguments_become_an_error_result(desktop, geo):
    c, r = run([reply(None, [call(1, raw="{not json")]), reply("ok", finish="stop")], desktop, geo)
    tool = [x for x in c.requests[1]["messages"] if x["role"] == "tool"][0]
    assert "unknown computer action" in tool["content"] and desktop.calls == []


def test_batch_failure_skips_later_calls(desktop, geo):
    c, _ = run([reply(None, [call(1, "type", text=""), call(2, "key", text="Return")]), reply("x", finish="stop")], desktop, geo)
    tools = [x for x in c.requests[1]["messages"] if x["role"] == "tool"]
    assert "Not executed" in tools[1]["content"] and desktop.calls == []


def test_truncated_and_filtered_responses_never_execute(desktop, geo):
    _, r = run([reply(None, [call(1, "type", text="partial")], finish="length")], desktop, geo)
    assert r.status == "truncated" and desktop.calls == []
    _, r = run([reply("no", finish="content_filter")], desktop, geo)
    assert r.status == "refused"


def test_decline_blocks_actions(desktop, geo):
    c = FakeOR([reply(None, [call(1, "type", text="hi")]), reply("ok", finish="stop")])
    r = run_agent_openrouter("t", c, desktop, geo, Approver(ask=lambda p: "n"), model="m", verbose=False)
    assert desktop.calls == [] and "Declined" in [x for x in c.requests[1]["messages"] if x["role"] == "tool"][0]["content"]


def test_bad_response_shape_raises(desktop, geo):
    with pytest.raises(OpenRouterError):
        run([{"error": "nope"}], desktop, geo)


def test_client_requires_key(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with pytest.raises(OpenRouterError):
        OpenRouterClient()


def test_dotenv_loads_without_overriding(tmp_path, monkeypatch):
    f = tmp_path / ".env"
    f.write_text("A_KEY=from-file\nB_KEY=\n# C=1\nEXISTING=file\n")
    monkeypatch.setenv("EXISTING", "env")
    monkeypatch.delenv("A_KEY", raising=False)
    monkeypatch.delenv("B_KEY", raising=False)
    load_dotenv(str(f))
    import os
    assert os.environ["A_KEY"] == "from-file" and os.environ["EXISTING"] == "env" and "B_KEY" not in os.environ
