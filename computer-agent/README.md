# computer-agent

An agent that **sees your screen** (screenshots) and **controls your mouse and keyboard** to carry out a task, driven by Claude Opus through **OpenRouter** (an Anthropic-API backend is also included).

> It acts on your real computer. Read *Safety* before running it.

## How it works
1. Takes a screenshot, shrinks it to ≤1280 px on the long edge, sends it with your task.
2. The model replies with actions (`left_click`, `type`, `key`, `scroll`, `zoom`, …); coordinates are in screenshot space and are scaled back to real screen pixels (HiDPI/Retina handled).
3. You approve each state-changing action; the agent runs it with `pyautogui` and returns the result and a fresh screenshot. Repeat until the model stops asking for actions or `--max-steps` is hit.

**OpenRouter note.** OpenRouter does not forward Anthropic's native `computer_toolset_20260801`, so the OpenRouter backend exposes the computer as one ordinary function tool (`computer` with an `action` enum) and sends screenshots as `image_url` data URIs. The `--backend anthropic` option uses the native toolset (`claude-opus-5-5`, no beta header).

## Setup (on the PC you want to control)
```bash
cd computer-agent
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -e .            # add ".[unicode]" for non-ASCII typing, ".[anthropic]" for the Anthropic backend
cp .env.example .env        # then fill in OPENROUTER_API_KEY and OPENROUTER_MODEL
```
`OPENROUTER_MODEL` must be a Claude Opus slug from <https://openrouter.ai/models> (an `anthropic/claude-opus-*` id); it was not verified from the build sandbox, which cannot reach OpenRouter.

macOS: grant your terminal *Screen Recording* and *Accessibility* in System Settings → Privacy & Security. Linux: needs an X11 session (Wayland blocks synthetic input).

```bash
python -m computer_agent "Open the calculator and compute 17*23" --log logs/run.jsonl
```
Options: `--model`, `--max-steps` (default 30), `--max-edge`, `--auto-approve`, `--backend anthropic`.

## Safety
- **Per-action confirmation** for anything that can change state (`y`/`n`/`a`lways/`q`uit). Screenshots, zoom, waits and hover run without asking. `--auto-approve` disables this; avoid it.
- **Emergency stop:** move the mouse into any screen corner (pyautogui failsafe) or press Ctrl+C. Hard cap on steps.
- **Privacy:** every screenshot goes to OpenRouter and the model provider. Close password managers, banking, private chats first.
- **Prompt injection:** text on screen (web pages, emails) is untrusted; the system prompt tells the model to treat it as data, but this is not a guarantee. Don't run it unattended on sensitive sessions.
- Truncated or filtered model replies are never executed; invalid arguments become error results.
- Run it in a throwaway VM/user account for anything risky.
- Keep your API key in `.env` (git-ignored) or the environment, never in code.

## Tests
```bash
pip install pytest && pytest
```
38 tests cover coordinate scaling (incl. HiDPI), every action, batch failure semantics, approval, both agent loops (with fake clients and a fake desktop), and `.env` loading. **Not covered:** real mouse/keyboard (`PyAutoGuiDesktop`) and live OpenRouter/Anthropic calls — these were not run in the build environment (no display, no OpenRouter access).
