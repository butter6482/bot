from __future__ import annotations

import argparse
import sys

from .desktop import PyAutoGuiDesktop
from .geometry import DEFAULT_MAX_EDGE, Geometry
from .loop import DEFAULT_MODEL, run_agent
from .safety import ActionLog, Approver


def load_dotenv(path: str = ".env") -> None:
    """Tiny .env reader (KEY=VALUE lines). Real environment variables win; empty values are ignored."""
    import os

    try:
        lines = open(path, encoding="utf-8").read().splitlines()
    except OSError:
        return
    for line in lines:
        key, sep, value = line.partition("=")
        key, value = key.strip(), value.strip().strip("\"'")
        if sep and key and value and not line.lstrip().startswith("#"):
            os.environ.setdefault(key, value)


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    p = argparse.ArgumentParser(prog="computer-agent", description="Let Claude see your screen and control mouse/keyboard.")
    p.add_argument("task", help="What Claude should do, e.g. 'open the calculator and compute 17*23'")
    p.add_argument("--backend", choices=["openrouter", "anthropic"], default="openrouter")
    p.add_argument("--model", help="OpenRouter model slug (or $OPENROUTER_MODEL), e.g. an anthropic/claude-opus-* slug from openrouter.ai/models")
    p.add_argument("--max-steps", type=int, default=30, help="Hard cap on model turns (default 30)")
    p.add_argument("--max-edge", type=int, default=DEFAULT_MAX_EDGE, help="Long edge of screenshots sent to the model")
    p.add_argument("--auto-approve", action="store_true", help="Skip per-action confirmation (dangerous)")
    p.add_argument("--log", help="Write a JSONL action log to this path")
    args = p.parse_args(argv)

    import os

    model = args.model or (os.environ.get("OPENROUTER_MODEL") if args.backend == "openrouter" else DEFAULT_MODEL)
    if not model:
        p.error("choose a model with --model or $OPENROUTER_MODEL (a Claude Opus slug from openrouter.ai/models)")

    desktop = PyAutoGuiDesktop()
    lw, lh = desktop.logical_size()
    nw, nh = desktop.capture().size
    geo = Geometry(lw, lh, nw, nh, args.max_edge)

    print(f"Screen {lw}x{lh} (capture {nw}x{nh}); model sees {geo.model_size[0]}x{geo.model_size[1]}.")
    print("Emergency stop: move the mouse into a screen corner, or press Ctrl+C.")
    where = "OpenRouter and the model provider" if args.backend == "openrouter" else "Anthropic"
    print(f"Privacy: screenshots of your screen are sent to {where}. Close anything sensitive first.")

    approver, log = Approver(args.auto_approve), ActionLog(args.log)
    if args.backend == "openrouter":
        from .openrouter import OpenRouterClient, run_agent_openrouter

        result = run_agent_openrouter(
            args.task, OpenRouterClient(), desktop, geo, approver, model=model, max_steps=args.max_steps, log=log
        )
    else:
        import anthropic  # reads ANTHROPIC_API_KEY (or an `ant auth login` profile)

        result = run_agent(
            args.task, anthropic.Anthropic(), desktop, geo, approver, model=model, max_steps=args.max_steps, log=log
        )
    print(f"\n[{result.status}] after {result.steps} step(s).")
    return 0 if result.status == "done" else 1


if __name__ == "__main__":
    sys.exit(main())
