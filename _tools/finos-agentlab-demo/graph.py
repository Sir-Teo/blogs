"""The trading desk's graph, as FinOS-AgentLab's runner builds it.

Run with agents-runtime's venv python. The graph is constructed and never
invoked, so a placeholder key is enough; nothing leaves the machine.

    OPENAI_API_KEY=sk-offline .venv/bin/python graph.py out.json
"""

from __future__ import annotations

import json
import os
import sys
import warnings

os.environ.setdefault("OPENAI_API_KEY", "sk-offline")
warnings.simplefilter("ignore")

from tradingagents.default_config import DEFAULT_CONFIG  # noqa: E402
from tradingagents.graph.trading_graph import TradingAgentsGraph  # noqa: E402


def main(out: str) -> None:
    config = dict(DEFAULT_CONFIG)
    config.update(
        llm_provider="openai",
        deep_think_llm="gpt-4o-mini",
        quick_think_llm="gpt-4o-mini",
        max_debate_rounds=1,
        max_risk_discuss_rounds=1,
    )
    graph = TradingAgentsGraph(
        selected_analysts=("market", "social", "news", "fundamentals"),
        debug=False,
        config=config,
    )
    drawn = graph.graph.get_graph()
    nodes = [name for name in drawn.nodes if not name.startswith("__")]
    edges = [
        [edge.source, edge.target, bool(edge.conditional)]
        for edge in drawn.edges
        if not edge.source.startswith("__") and not edge.target.startswith("__")
    ]
    entry = sorted(edge.target for edge in drawn.edges if edge.source == "__start__")
    with open(out, "w") as fh:
        json.dump(
            {
                "version": graph.run_settings().get("version"),
                "nodes": nodes,
                "edges": edges,
                "entry": entry,
            },
            fh,
            indent=0,
        )
    print(f"{len(nodes)} nodes, {len(edges)} edges, entry {entry}")


if __name__ == "__main__":
    main(sys.argv[1])
