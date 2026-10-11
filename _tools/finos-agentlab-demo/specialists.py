"""What a specialist is handed, measured with the loop's own `plan_tools`.

The copilot delegates a sub-question with `research_subagent(agent=...)`; the
loop's `_research` builds the child's TurnContext (ask mode, actions off, the
specialist's `tools` as `only_tools`) and the child plans its tools like any
turn. This builds the same context for each shipped specialist and records
what `plan_tools` offers it, beside the parent agent-mode turn on the same
question, and the role allowlists both are cut from.

Run from FinOS-AgentLab/backend with its venv python:

    DATABASE_URL=sqlite:////tmp/x.db .venv/bin/python specialists.py out.json

Web search counts as configured (a deployment with a search provider), so the
`web` specialist is measured as declared rather than as this offline box,
which has no provider and would strip the tool.
"""

from __future__ import annotations

import json
import sys
import warnings

warnings.simplefilter("ignore")

from app.services import copilot as cp  # noqa: E402
from app.services import copilot_loop as loop  # noqa: E402
from app.services import copilot_modes as modes  # noqa: E402
from app.services import copilot_subagents as subagents  # noqa: E402
from app.services.copilot_tools import web_search  # noqa: E402

web_search.configured_provider = lambda: "configured"

QUESTION = "Why did NVDA fall after its last earnings report?"


def kind(name: str) -> str:
    if name in cp.ACTION_TOOL_NAMES:
        return "action"
    if name in cp.WRITE_TOOL_NAMES:
        return "write"
    if name in cp._CORE_TOOL_NAMES:
        return "core"
    return "read"


def main(out: str) -> None:
    registry = cp.TOOL_REGISTRY
    order = {"core": 0, "read": 1, "write": 2, "action": 3}
    names = sorted(registry, key=lambda n: (order[kind(n)], n))
    index = {n: i for i, n in enumerate(names)}
    catalogue = [[n, len(json.dumps(registry[n])), kind(n)] for n in names]

    def plan(ctx: loop.TurnContext) -> dict:
        tools = loop.plan_tools(ctx).tools
        offered = [t["function"]["name"] for t in tools]
        return {
            "tools": sorted(index[n] for n in offered if n in index),
            "chars": len(json.dumps(tools)),
        }

    messages = [{"role": "user", "content": QUESTION}]
    parent = plan(loop.TurnContext(messages=messages, symbol="NVDA", mode=modes.AGENT, page="/"))
    specs = []
    for agent in subagents._AGENTS:
        # As `CopilotLoop._research` builds the child's context.
        child = loop.TurnContext(
            messages=messages, symbol="NVDA", mode=modes.ASK, allow_actions=False,
            suggestions=False, page="/", only_tools=list(agent.tools) or None,
            extra_instructions=agent.instructions, max_rounds=agent.max_rounds,
        )
        specs.append({
            "name": agent.name,
            "description": agent.description,
            "instructions": agent.instructions,
            "declared": list(agent.tools),
            **plan(child),
        })

    allowed = {
        "agent": sorted(index[t["function"]["name"]] for t in cp.tools_for_role("local", allow_actions=True)),
        "child": sorted(index[t["function"]["name"]] for t in cp.tools_for_role("local", allow_actions=False)),
    }
    data = {
        "question": QUESTION,
        "catalogue": catalogue,
        "allowed": allowed,
        "parent": parent,
        "specialists": specs,
        "limits": {
            "user_agents": subagents.MAX_USER_AGENTS,
            "rounds": subagents.MAX_ROUNDS,
            "depth": loop._MAX_RESEARCH_DEPTH,
            "ask_rounds": modes.ASK.max_tool_rounds,
            "agent_rounds": modes.AGENT.max_tool_rounds,
            "agent_cap": modes.AGENT.max_rounds_cap,
        },
    }
    with open(out, "w") as fh:
        json.dump(data, fh, indent=0)
    print(json.dumps({
        "catalogue": len(catalogue),
        "kinds": {k: sum(1 for c in catalogue if c[2] == k) for k in order},
        "allowed": {k: len(v) for k, v in allowed.items()},
        "parent": (len(parent["tools"]), parent["chars"]),
        "specialists": [(s["name"], len(s["declared"]), len(s["tools"]), s["chars"]) for s in specs],
    }))


if __name__ == "__main__":
    main(sys.argv[1])
