"""What one copilot turn carries, measured with the backend's own functions.

Run from FinOS-AgentLab/backend with its venv python (DATABASE_URL set to a
scratch file; nothing is written that matters). `tools_for_request` routes the
schemas exactly as a live turn does; `build_messages`' rungs are built with the
same helpers, for a turn on the Dashboards page with four widgets on screen.

    DATABASE_URL=sqlite:////tmp/x.db .venv/bin/python copilot_measure.py out.json
"""

from __future__ import annotations

import ast
import json
import re
import sys
import warnings
from pathlib import Path

warnings.simplefilter("ignore")

from app.services import copilot as cp  # noqa: E402
from app.services import copilot_commands as cc  # noqa: E402
from app.services import copilot_loop as loop  # noqa: E402

QUESTIONS = [
    "what is going on",
    "how is my book doing?",
    "is NVDA correlated with AMD?",
    "backtest a 50/200 crossover on SPY",
    "remind me three days before Apple reports",
    "what did the Fed decide?",
]

# The six scripted scenarios whose turn sizes stand in for a conversation.
CONVERSATION = [
    "quote.direct",
    "ticker.from_the_feed",
    "markets.overview",
    "action.add_widget",
    "injection.page_instruction_is_not_obeyed",
    "artifacts.revises_rather_than_rewrites",
]


# The app's own destinations (frontend/components/layout/nav-items.ts, plus a
# stock page), in nav order. The payload test also pins /agents, /company,
# /researcher and /studio, which the frontend has since retired or redirects.
PAGES = ["/agentchat", "/", "/dashboards", "/earnings", "/world", "/markets", "/s/NVDA",
         "/portfolio", "/watchlists", "/data"]


def ceilings() -> dict[str, int]:
    """The per-page pins from the backend's own test, read from its source."""
    source = Path("tests/test_copilot_find_widgets.py").read_text()
    match = re.search(r"ceilings = (\{[^}]*\})", source)
    return ast.literal_eval(match.group(1)) if match else {}


def intent_hits(question: str) -> dict[str, set[str]]:
    """Intent groups whose keywords the question trips, and their tools."""
    latest = question.lower()
    hits: dict[str, set[str]] = {}
    for group, (keywords, names) in cp._INTENT_TOOL_GROUPS.items():
        if any(keyword in latest for keyword in keywords):
            hits[group] = set(names)
    return hits


def main(out: str) -> None:
    pins = ceilings()
    pages = PAGES
    registry = cp.TOOL_REGISTRY
    core = sorted(name for name in cp._CORE_TOOL_NAMES if name in registry)
    tool_index: dict[str, int] = {}
    tools: list[list] = []

    def idx(name: str) -> int:
        if name not in tool_index:
            tool_index[name] = len(tools)
            tools.append([name, len(json.dumps(registry[name])), name in cp._CORE_TOOL_NAMES])
        return tool_index[name]

    combos = []
    for qi, question in enumerate(QUESTIONS):
        hits = intent_hits(question)
        for pi, page in enumerate(pages):
            routed = cp.tools_for_request([{"role": "user", "content": question}], "local", page=page)
            root = "/" + page.strip("/").split("/")[0]
            page_group = cp._PAGE_TOOL_GROUPS.get(root, set())
            rows = []
            for tool in routed:
                name = tool["function"]["name"]
                if name in cp._CORE_TOOL_NAMES:
                    why = "core"
                elif name in page_group:
                    why = "page"
                else:
                    why = next((g for g, names in hits.items() if name in names), "intent")
                rows.append([idx(name), why])
            combos.append({"q": qi, "p": pi, "chars": len(json.dumps(routed)), "tools": rows})

    full = cp.tools_for_role("local", allow_actions=True)

    # The rungs of build_messages, for one realistic turn.
    # What a fresh workspace lists: the shipped commands the model may invoke
    # (`commands_for_model` adds the user's own and their servers' prompts).
    commands = [c.model_dump() for c in cc.BUILTIN_COMMANDS if c.auto]
    widgets = [
        {"type": "chart", "symbol": "NVDA", "id": "w-chart-1"},
        {"type": "quote", "symbol": "NVDA", "id": "w-quote-1"},
        {"type": "news", "symbol": "NVDA", "id": "w-news-1"},
        {"type": "fundamentals", "symbol": "NVDA", "id": "w-fund-1"},
    ]
    messages = [{"role": "user", "content": "What is NVDA at?"}]

    def ctx(mode: str, acts: bool = True) -> loop.TurnContext:
        return loop.TurnContext(messages=messages, symbol="NVDA", page="/dashboards",
                                widgets=widgets, mode=mode, allow_actions=acts, commands=commands)

    policy = {
        "ask": len(loop.build_policy_block(ctx("ask"))),
        "plan": len(loop.build_policy_block(ctx("plan"))),
        "agent": len(loop.build_policy_block(ctx("agent"))),
        "no_actions": len(loop.build_policy_block(ctx("agent", False))),
    }
    context = loop.build_context_block(ctx("agent"), "")
    rungs = {
        "system": len(loop.SYSTEM_PROMPT),
        "commands": len(cp._command_block(commands).strip()),
        "command_count": len(commands),
        "policy": policy,
        "context": len(context),
        "clock": loop.clock_line(),
        "tools_dashboards": len(json.dumps(cp.tools_for_request(messages, "local", page="/dashboards"))),
    }

    # Turn sizes from the scripted scenarios: the user's words, the tool
    # calls with their stubbed results, and the answer.
    from evals.scenarios import SUITES
    by_id = {s.id: s for s in SUITES["core"]}
    turns = []
    for sid in CONVERSATION:
        s = by_id[sid]
        tool_chars = 0
        answer = ""
        for round_ in s.script:
            for call in round_.calls:
                tool_chars += len(json.dumps(call.args)) + len(json.dumps((s.tools or {}).get(call.name)))
            answer += round_.text
        turns.append({"id": sid, "user": len(s.prompt), "tools": tool_chars, "assistant": len(answer)})

    with open(out, "w") as fh:
        json.dump({
            "pages": pages,
            "ceilings": [pins.get(p) for p in pages],
            "questions": QUESTIONS,
            "tools": tools,
            "combos": combos,
            "core": {"count": len(core), "chars": sum(len(json.dumps(registry[n])) for n in core)},
            "full": {"count": len(full), "chars": len(json.dumps(full))},
            "registry": len(registry),
            "rungs": rungs,
            "turns": turns,
        }, fh, indent=0)
    print(json.dumps({"pages": len(pages), "combos": len(combos), "tools": len(tools), "rungs": rungs}))


if __name__ == "__main__":
    main(sys.argv[1])
