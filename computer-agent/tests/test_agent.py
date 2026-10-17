import base64
import io

import pytest
from PIL import Image

from computer_agent.actions import NOT_EXECUTED, ActionError, execute
from computer_agent.geometry import Geometry
from computer_agent.loop import computer_calls, run_agent, run_calls
from computer_agent.safety import ActionLog, Approver, Quit

from conftest import FakeClient, FakeDesktop, response, text, tool_use


def auto():
    return Approver(auto_approve=True)


# ── geometry ──
def test_scale_and_model_size(geo):
    assert geo.scale == 0.5 and geo.model_size == (1000, 500)


def test_no_upscaling_on_small_screens():
    g = Geometry(800, 600, 800, 600, max_edge=1280)
    assert g.scale == 1.0 and g.model_size == (800, 600)


def test_to_logical_scales_and_clamps(geo):
    assert geo.to_logical(100, 50) == (200, 100)
    assert geo.to_logical(99999, -5) == (1999, 0)
    assert geo.to_model(200, 100) == (100, 50)


def test_region_to_native_accounts_for_hidpi(geo):
    # model px -> logical (x2) -> native (x2) = x4
    assert geo.region_to_native([10, 20, 110, 70]) == (40, 80, 440, 280)
    assert geo.region_to_native([110, 70, 10, 20]) == (40, 80, 440, 280)  # reversed corners
    with pytest.raises(ValueError):
        geo.region_to_native([5, 5, 5, 5])


# ── actions ──
def test_click_is_scaled_to_real_screen(desktop, geo):
    execute("left_click", {"coordinate": [100, 50]}, desktop, geo)
    assert desktop.calls == [("click", 200, 100, "left", 1, ())]


def test_click_variants_and_modifiers(desktop, geo):
    execute("double_click", {"coordinate": [1, 1]}, desktop, geo)
    execute("right_click", {"coordinate": [1, 1], "text": "shift+ctrl"}, desktop, geo)
    assert desktop.calls[0][3:5] == ("left", 2)
    assert desktop.calls[1][3] == "right" and desktop.calls[1][5] == ("shift", "ctrl")


def test_click_without_coordinate_uses_cursor(desktop, geo):
    execute("left_click", {}, desktop, geo)
    assert desktop.calls == [("click", None, None, "left", 1, ())]


def test_drag_scroll_type_key(desktop, geo):
    execute("left_click_drag", {"start_coordinate": [10, 10], "coordinate": [20, 20]}, desktop, geo)
    execute("scroll", {"scroll_direction": "down", "scroll_amount": 5, "coordinate": [10, 10]}, desktop, geo)
    execute("type", {"text": "hello"}, desktop, geo)
    execute("key", {"text": "ctrl+s", "repeat": 2}, desktop, geo)
    assert desktop.calls == [
        ("drag", 20, 20, 40, 40, ()),
        ("scroll", 20, 20, "down", 5),
        ("type", "hello"),
        ("key", ("ctrl", "s"), 2),
    ]


def test_cursor_position_is_reported_in_model_space(desktop, geo):
    out = execute("cursor_position", {}, desktop, geo)
    assert out == [{"type": "text", "text": "X=500,Y=250"}]


def test_screenshot_is_downscaled_png(desktop, geo):
    (block,) = execute("screenshot", {}, desktop, geo)
    img = Image.open(io.BytesIO(base64.b64decode(block["source"]["data"])))
    assert img.size == (1000, 500) and block["source"]["media_type"] == "image/png"


def test_zoom_returns_native_resolution_crop(desktop, geo):
    (block,) = execute("zoom", {"region": [10, 20, 110, 70]}, desktop, geo)
    img = Image.open(io.BytesIO(base64.b64decode(block["source"]["data"])))
    assert img.size == (400, 200)


@pytest.mark.parametrize(
    "name,inp",
    [
        ("left_click", {"coordinate": "oops"}),
        ("scroll", {"scroll_direction": "sideways"}),
        ("type", {"text": ""}),
        ("key", {"text": "a", "repeat": 1000}),
        ("wait", {"duration": 9999}),
        ("zoom", {"region": [1, 2]}),
        ("format_disk", {}),
    ],
)
def test_bad_input_is_rejected_without_touching_the_desktop(desktop, geo, name, inp):
    with pytest.raises(ActionError):
        execute(name, inp, desktop, geo)
    assert desktop.calls == []


# ── batches ──
def test_batch_stops_at_first_failure_and_marks_the_rest(desktop, geo):
    calls = [tool_use(1, "left_click", coordinate=[1, 1]), tool_use(2, "type", text=""), tool_use(3, "key", text="Return")]
    results = run_calls(calls, desktop, geo, auto(), ActionLog(None))
    assert [r["tool_use_id"] for r in results] == ["t1", "t2", "t3"]
    assert "is_error" not in results[0] and results[1]["is_error"] and results[2]["content"] == NOT_EXECUTED
    assert all(r["toolset_name"] == "computer" for r in results)
    assert len(desktop.calls) == 1  # the key press never ran


def test_os_level_errors_become_error_results(desktop, geo):
    desktop.fail_on = "click"
    (r,) = run_calls([tool_use(1, "left_click", coordinate=[1, 1])], desktop, geo, auto(), ActionLog(None))
    assert r["is_error"] and "boom" in r["content"]


# ── approval ──
def test_declined_batch_executes_nothing(desktop, geo):
    ap = Approver(ask=lambda p: "n")
    results = run_calls([tool_use(1, "left_click", coordinate=[1, 1]), tool_use(2, "type", text="x")], desktop, geo, ap, ActionLog(None))
    assert desktop.calls == [] and all(r["is_error"] for r in results)


def test_read_only_actions_need_no_approval(desktop, geo):
    def never(_):
        raise AssertionError("should not prompt")

    results = run_calls([tool_use(1, "screenshot")], desktop, geo, Approver(ask=never), ActionLog(None))
    assert "is_error" not in results[0]


def test_always_and_quit_answers():
    answers = iter(["maybe", "a"])
    ap = Approver(ask=lambda p: next(answers))
    assert ap.approve([("type", {"text": "x"})]) is True and ap.auto_approve
    with pytest.raises(Quit):
        Approver(ask=lambda p: "q").approve([("key", {"text": "Return"})])


# ── loop ──
def test_full_loop_screenshot_click_done(desktop, geo):
    client = FakeClient([
        response([text("Looking."), tool_use(1, "screenshot")]),
        response([tool_use(2, "left_click", coordinate=[100, 50]), tool_use(3, "screenshot")]),
        response([text("All done.")], "end_turn"),
    ])
    r = run_agent("click the button", client, desktop, geo, auto(), verbose=False)
    assert r.status == "done" and r.final_text == "All done." and r.steps == 3
    assert ("click", 200, 100, "left", 1, ()) in desktop.calls
    req = client.requests[0]
    assert req["model"] == "claude-opus-5-5" and req["tools"] == [{"type": "computer_toolset_20260801"}]
    assert "betas" not in req and "name" not in req["tools"][0]
    # second request carries the screenshot result for t1, echoing the toolset name
    sent = client.requests[1]["messages"][-1]["content"]
    assert sent[0]["tool_use_id"] == "t1" and sent[0]["toolset_name"] == "computer"
    assert sent[0]["content"][0]["type"] == "image"
    # every tool_use of a turn is answered in the same user message
    assert [x["tool_use_id"] for x in client.requests[2]["messages"][-1]["content"]] == ["t2", "t3"]


def test_refusal_stops_the_run(desktop, geo):
    r = run_agent("x", FakeClient([response([text("no")], "refusal")]), desktop, geo, auto(), verbose=False)
    assert r.status == "refused" and desktop.calls == []


def test_truncated_tool_calls_are_never_executed(desktop, geo):
    client = FakeClient([response([tool_use(1, "type", text="partial")], "max_tokens")])
    r = run_agent("x", client, desktop, geo, auto(), verbose=False)
    assert r.status == "truncated" and desktop.calls == []


def test_max_steps_is_a_hard_cap(desktop, geo):
    client = FakeClient([response([tool_use(i, "screenshot")]) for i in range(10)])
    r = run_agent("x", client, desktop, geo, auto(), max_steps=3, verbose=False)
    assert r.status == "max_steps" and len(client.requests) == 3


def test_quit_during_approval_ends_the_run(desktop, geo):
    client = FakeClient([response([tool_use(1, "type", text="hi")])])
    r = run_agent("x", client, desktop, geo, Approver(ask=lambda p: "q"), verbose=False)
    assert r.status == "quit" and desktop.calls == []


def test_only_computer_toolset_blocks_are_treated_as_actions():
    other = type("B", (), {"type": "tool_use", "id": "z", "name": "bash", "toolset_name": None, "input": {}})()
    assert computer_calls([other, tool_use(1, "screenshot")]) == [computer_calls([tool_use(1, "screenshot")])[0].__class__ and computer_calls([other, tool_use(1, "screenshot")])[0]]
