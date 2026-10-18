---
layout: post
title: "Putting a trading desk behind a dashboard"
description: >-
  How FinOS-AgentLab isolates a LangGraph trading desk and a vectorbt quant
  worker behind FastAPI, routes 138 copilot tools under strict token ceilings,
  caches prompt prefixes, and tests its agent loop offline.
date: 2026-10-10 08:00:00 -0400
excerpt: >-
  Inside FinOS-AgentLab—how a self-hosted finance workspace isolates its
  multi-agent trading desk, routes 138 tools without blowing the prompt budget,
  orders system messages for prefix caching, and tests its loop without an API key.
links:
  - title: Source
    url: https://github.com/Sir-Teo/FinOS-AgentLab
styles:
  - /assets/css/finos-agentlab.css
scripts:
  - /assets/js/finos-agentlab.js
---

**FinOS-AgentLab** is a self-hosted financial research workspace that pairs a page-aware copilot on every screen with five specialist sub-agents and a multi-agent `TradingAgents` desk behind it. Every interactive figure below either runs the backend's own Python routing, prompt-assembly, and scheduler code offline, or replays the 22 desk transcripts and scripted evaluation passes recorded in the repository.

## Four processes

<figure class="fig" id="fa-arch">
<svg class="arch" viewBox="0 0 680 318" role="img" aria-label="Architecture: a Next.js app talks to a FastAPI backend over REST, server-sent events and a WebSocket; the backend starts a TradingAgents subprocess per desk run and keeps one warm quant worker, both speaking JSON lines; SQLite and provider caches sit underneath.">
<defs>
<marker id="fa-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path class="head-strong" d="M0,1 L9,5 L0,9 z"/></marker>
</defs>
<rect class="box" x="24" y="24" width="632" height="42" rx="6"/>
<text class="t" x="340" y="38">Next.js app</text>
<text class="st" x="340" y="55">agent chat, home, dashboards, markets, stock pages, portfolio, watchlists, world, data</text>
<path class="edge-strong" data-flow="both" d="M340 68 V98" marker-start="url(#fa-arrow)" marker-end="url(#fa-arrow)"/>
<text class="el" x="430" y="87">REST · SSE · WebSocket</text>
<rect class="box em" x="24" y="100" width="632" height="60" rx="6"/>
<text class="t" x="340" y="116">FastAPI backend</text>
<text class="st" x="340" y="134">543 routes · 454 service modules · one scheduler</text>
<text class="st" x="340" y="150">copilot: 138 tools, 21 of them core · 5 specialists · 150 shipped commands</text>
<path class="edge-strong" data-flow="up" d="M176 162 V190" marker-start="url(#fa-arrow)"/>
<text class="el" x="252" y="181" style="font-size:9.5px">JSONL, one event per line</text>
<path class="edge-strong" data-flow="both" d="M504 162 V190" marker-start="url(#fa-arrow)" marker-end="url(#fa-arrow)"/>
<text class="el" x="582" y="181" style="font-size:9.5px">JSONL, request and reply</text>
<rect class="box" x="24" y="192" width="304" height="58" rx="6"/>
<text class="t" x="176" y="208">agents-runtime</text>
<text class="st" x="176" y="225">TradingAgents 0.6.0 on LangGraph, its own venv</text>
<text class="st" x="176" y="240">one subprocess per run, at most five at once</text>
<rect class="box" x="352" y="192" width="304" height="58" rx="6"/>
<text class="t" x="504" y="208">quant-runtime</text>
<text class="st" x="504" y="225">vectorbt and numba, its own venv</text>
<text class="st" x="504" y="240">one warm worker, respawned when it stalls</text>
<rect class="box" x="24" y="274" width="632" height="38" rx="6"/>
<text class="t" x="340" y="287">On disk</text>
<text class="st" x="340" y="303">SQLite: dashboards, watchlists, runs, chats, specialists, settings · provider caches · the desk’s memory log</text>
</svg>
<figcaption>The desk and the quant engine run in their own virtual environments and talk to the backend one JSON line at a time.</figcaption>
</figure>

Splitting a self-hosted workspace across four processes and three Python virtual environments was a truce with dependency management. `TradingAgents` pulls in the LangChain and LangGraph stack, while the quantitative backtesting engine relies on `vectorbt` and `numba`—and both pin transitive packages that clash directly with the FastAPI backend's own dependencies.

Rather than forcing three incompatible dependency trees into a single environment, the backend isolates both runtimes behind newline-delimited JSON (`JSONL`) pipes over standard input and output. Each desk run spawns a fresh `agents-runtime` subprocess and relays its `stdout` lines to the browser as server-sent events; because each LangGraph process claims a few hundred megabytes of memory, a semaphore caps concurrent runs at five and queues the rest. The `quant-runtime` takes the opposite lifecycle: importing `numba` and `vectorbt` is slow, so the backend starts one worker at boot, keeps it warm across requests, and respawns it automatically if a calculation stalls.

## The desk

<figure class="fig wide" id="fa-firm" style="--reserve: 900px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>TradingAgents 0.6.0's graph as the runner builds it, and the 22 desk runs recorded in the project's static export, each event a block sized by its bytes.</figcaption>
</figure>

Convening the trading desk used to be a tool the chat copilot could invoke on its own, which meant a casual question could accidentally launch a multi-minute, twelve-node LangGraph debate. Now a desk run is always deliberate: typing `@TradingAgents NVDA` in chat starts the graph directly and streams every analyst report, bull-versus-bear rebuttal, and risk-committee turn into the thread without a model middleman deciding whether to.

Ten of the 22 recorded runs reached a final portfolio verdict (3 `BUY`, 5 `SELL`, 2 `HOLD`), and the runner's `parse_action` extracts the exact same call from all ten. Replaying those transcripts surfaced two bugs that only appear when real model routers and LangGraph state dictionaries meet. In <a class="act" href="#fa-firm" data-run="e35b83">one NVDA run</a> and <a class="act" href="#fa-firm" data-run="a730e0">one MU run</a>, a free upstream model router intercepted the Bull Researcher's turn and returned a bare content-safety classifier label (`safety: safe`) instead of a bull case; with nobody arguing for the stock, both desks marched straight to `SELL`. Since September, the runner checks every turn against a classifier pattern and redraws the reply up to three times before any downstream agent reads it:

```py
_CLASSIFIER_REPLY = re.compile(
    r"^\s*(?:(?:user|response|prompt|agent)\s+)?safety\s*:\s*(?:un)?safe\b", re.IGNORECASE
)
```

A quieter bug hid in the risk committee at the end of the graph. Every finished run in the snapshot streamed only the `Neutral` risk analyst's turn. All three risk voices had actually run, but the runner looked up `risky` and `safe` in the state dictionary where `TradingAgents 0.6.0` writes `aggressive` and `conservative`—silently dropping two of the three risk perspectives until a contract test pinned the state keys.

## What a turn carries

<figure class="fig wide" id="fa-pay" style="--reserve: 505px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>Prompt and tool schemas routed for one question on each of the app's pages, each tool a block, measured with the backend's <code>tools_for_request</code> against the ceilings its tests pin.</figcaption>
</figure>

Because an LLM API call pays for every tool schema on every round, shipping the full registry of 138 tools on every turn would burn tens of thousands of prompt characters before the user asked a question. Instead, `tools_for_request` routes a slice of the catalogue per turn: the 21 core tools are always included, the current page adds its own domain group, and keywords in the user's question trip any matching intent groups.

To keep schema bloat from creeping back in, a test pins a strict character ceiling for a plain question on each route and requires a written note in the test file whenever a ceiling is raised. The `/dashboards` page already sits at 28,923 characters against a 28,950 ceiling before any question keywords fire, and asking <a class="act" href="#fa-pay" data-q="1">a question about the book</a> (`"how is my book doing?"`) pulls in enough portfolio and risk tools to push almost every page past its baseline cap.

## Ordered by how often it changes

<figure class="fig" id="fa-rungs" style="--reserve: 420px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>Six turns of one conversation as the loop assembles them, measured with the backend's own prompt, command, policy and context builders, with turn sizes from its scripted scenarios.</figcaption>
</figure>

Routing fewer tools shrinks each request; ordering the prompt blocks keeps the provider's prefix cache warm across turns. On every turn, the loop sends up to five system messages arranged strictly by how often each one changes: the base system prompt (`4,998` chars), the listing of 150 slash commands (`15,962` chars), and the mode policy (`1,073` chars) sit at the very top, followed by the growing conversation history.

The page context block (`687` chars) carries a wall-clock timestamp that changes every minute, so it is placed last, immediately before the newest user question. <a class="act" href="#fa-rungs" data-order="old">It used to sit before the history</a>—which meant that every time the clock ticked over a minute, that single changing line invalidated the provider's prefix cache for the entire conversation history behind it.

## Building an agent

<figure class="fig wide" id="fa-spec" style="--reserve: 450px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>The copilot's 138 tools, one cell each, and what the loop's <code>plan_tools</code> hands the parent turn and each shipped specialist for the same question.</figcaption>
</figure>

When a question needs several rounds of data gathering, the copilot can delegate a sub-question to a specialist: a smaller child loop with its own instructions and a narrower slice of the tool catalogue, which runs the lookups in isolation and returns one synthesized paragraph. Five specialists ship with the app (`general`, `market`, `filings`, `web`, and `portfolio`), and a user can declare up to eight custom specialists in settings—each with a `@name` handle, up to 4,000 characters of instructions, a tool allowlist, a model choice, and a cap of eight rounds.

What a custom declaration cannot override is fixed in the loop itself: every child runs in `ask` mode with mutating actions disabled, its tool list can only ever narrow the parent's read-only tools, and a specialist cannot delegate again. Because <a class="act" href="#fa-spec" data-agent="general">the general specialist</a> declares no tool filter of its own, `plan_tools` hands it the full read-only slice routed by the question—`research_subagent` included—and the loop refuses the call at depth one if it tries to recurse.

## One fire per slot

<figure class="fig wide" id="fa-jobs" style="--reserve: 680px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>A week of the ten system jobs on the backend's own scheduler, stepped a minute at a time, with one window of it drawn minute by minute.</figcaption>
</figure>

A single scheduler drives the backend's ten recurring system jobs—market snapshots, nightly syncs, thesis scans, and morning or evening briefs—stepping once a minute. Each job is keyed to a slot (a local calendar date or an hour bucket) and may succeed at most once per slot; during an <a class="act" href="#fa-jobs" data-scenario="outage">upstream outage</a>, a failing pass retries up to three times in that slot, one minute apart, before waiting for the next window.

Because a self-hosted box can reboot or sleep at any hour, a <a class="act" href="#fa-jobs" data-scenario="restart">restart</a> treats any pass left marked `running` in SQLite as failed and re-fires it immediately, while skipping any morning brief whose catch-up window has already closed rather than delivering a pre-market summary at noon.

## Evals without a key

<figure class="fig wide" id="fa-evals" style="--reserve: 680px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>The core suite run scripted on this machine and replayed at its recorded pace: the real loop, catalogue and checks against a model that plays a fixed script, with no network.</figcaption>
</figure>

Half of the core evaluation suite (17 of 34 scenarios, 144 checks in all) runs in five seconds without an API key and with outbound network connections blocked, because what it guards is the loop rather than the model. A scripted fake model replays predetermined tool calls and failure modes against the real `CopilotLoop`, tool registry, and permission checks: verifying that <a class="act" href="#fa-evals" data-id="permission.attempt_is_refused">an action attempted in ask mode is stopped</a> before touching disk, that <a class="act" href="#fa-evals" data-id="leaked_call.retried_not_shipped">a tool call written as prose is handed back</a> for a retry rather than shown to the user, and that <a class="act" href="#fa-evals" data-id="horizon.early_lookup_survives">the sixteen-lookup turn</a> compacts older tool results out of its context window as it works and still answers using the very first lookup.
