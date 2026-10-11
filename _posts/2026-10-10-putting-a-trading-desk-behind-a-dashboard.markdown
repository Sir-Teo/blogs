---
layout: post
title: "Putting a trading desk behind a dashboard"
description: >-
  FinOS-AgentLab is a self-hosted finance workspace with a copilot on every
  page, specialists it can delegate to, and a desk of TradingAgents behind it.
  Its graph, routing, scheduler and offline evals, run as figures, with the 22
  desk runs it recorded.
date: 2026-10-10 08:00:00 -0400
excerpt: >-
  A self-hosted finance workspace with a copilot, its specialists and a desk
  of trading agents behind it. Figures from its own code, and the 22 desk runs
  it recorded.
links:
  - title: Source
    url: https://github.com/Sir-Teo/FinOS-AgentLab
styles:
  - /assets/css/finos-agentlab.css
scripts:
  - /assets/js/finos-agentlab.js
---

FinOS-AgentLab is a self-hosted finance workspace with a copilot on every page and a desk of TradingAgents behind it. Every figure below runs the project's own code offline, or replays what it recorded.

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

TradingAgents pulls in the LangChain stack, whose pins clash with the backend's own, so the backend starts the desk as a subprocess and relays its standard output as server-sent events. Each run forks a process of a few hundred megabytes, so at most five run at once and the rest wait as queued. The quant worker is started once, kept warm, and respawned if it stops answering.

## The desk

<figure class="fig wide" id="fa-firm" style="--reserve: 900px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>TradingAgents 0.6.0's graph as the runner builds it, and the 22 desk runs recorded in the project's static export, each event a block sized by its bytes.</figcaption>
</figure>

A run now starts from the chat: `@TradingAgents NVDA` convenes the desk and streams it into the thread, with no model deciding to. Ten of the 22 recorded runs reached a decision, and the runner's `parse_action` reads the same call from all ten. In <a class="act" href="#fa-firm" data-run="e35b83">one NVDA run</a> and <a class="act" href="#fa-firm" data-run="a730e0">one MU run</a> the Bull Researcher's whole turn is a content-safety classifier's verdict, and both desks went on to sell. The project's notes trace such answers to the free router, and since September the runner redraws them, up to three times, before any agent reads them.

```py
_CLASSIFIER_REPLY = re.compile(
    r"^\s*(?:(?:user|response|prompt|agent)\s+)?safety\s*:\s*(?:un)?safe\b", re.IGNORECASE
)
```

Every finished run streamed one risk voice of three. The runner read `risky` and `safe` where the state says aggressive and conservative, so those two voices ran and nothing relayed them, a mismatch its tests now pin.

## What a turn carries

<figure class="fig wide" id="fa-pay" style="--reserve: 505px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>Prompt and tool schemas routed for one question on each of the app's pages, each tool a block, measured with the backend's <code>tools_for_request</code> against the ceilings its tests pin.</figcaption>
</figure>

Every tool's schema ships on every API call, so the catalogue of 138 is routed rather than sent: the 21 core tools always, the page's own group, and the groups a question's words trip. The ceilings are pinned for the plain question, and the test that holds them narrates every raise. <a class="act" href="#fa-pay" data-q="1">A question about the book</a> runs past most of them, and the dashboards page sits closest to its own before any question does.

## Ordered by how often it changes

<figure class="fig" id="fa-rungs" style="--reserve: 420px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>Six turns of one conversation as the loop assembles them, measured with the backend's own prompt, command, policy and context builders, with turn sizes from its scripted scenarios.</figcaption>
</figure>

The loop sends up to five system messages, ordered by how often each changes, so a provider's prompt cache finds the longest identical prefix. The context block carries a clock that moves every minute, so it goes last, just before the newest question. <a class="act" href="#fa-rungs" data-order="old">It used to sit before the history</a>, and every turn re-sent the whole conversation behind a line that was always new.

## Building an agent

<figure class="fig wide" id="fa-spec" style="--reserve: 450px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>The copilot's 138 tools, one cell each, and what the loop's <code>plan_tools</code> hands the parent turn and each shipped specialist for the same question.</figcaption>
</figure>

The copilot can hand a sub-question to a specialist: a smaller loop with its own instructions and its own slice of the tools, which does the lookups and returns one paragraph. Five ship with the app. A user can declare eight more in settings, each a name, up to 4,000 characters of instructions, the tools it may use, a model and a cap of eight rounds, and reach one with `@name` in a message or from a saved command. What a declaration cannot change is fixed in the loop: the child runs in ask mode with actions off, its tools only ever narrow the parent's, and it cannot delegate again. <a class="act" href="#fa-spec" data-agent="general">The general specialist</a> declares no tools, so it gets the read-only catalogue routed by the question, `research_subagent` included, and is refused if it calls it.

## One fire per slot

<figure class="fig wide" id="fa-jobs" style="--reserve: 680px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>A week of the ten system jobs on the backend's own scheduler, stepped a minute at a time, with one window of it drawn minute by minute.</figcaption>
</figure>

A job may fire once per slot, a local date or an hour bucket, and a failed pass may fire again up to three times in that slot, a tick apart. A <a class="act" href="#fa-jobs" data-scenario="restart">restart</a> treats a pass left running as failed and refires it, and skips a brief whose catch-up window has closed rather than send it at noon.

## Evals without a key

<figure class="fig wide" id="fa-evals" style="--reserve: 680px" data-src="{{ '/assets/data/finos-agentlab-demo.json' | relative_url }}">
<figcaption>The core suite run scripted on this machine and replayed at its recorded pace: the real loop, catalogue and checks against a model that plays a fixed script, with no network.</figcaption>
</figure>

Half the core suite runs without a model, because what it guards is the loop: that <a class="act" href="#fa-evals" data-id="permission.attempt_is_refused">an action attempted in ask mode is stopped</a>, and that <a class="act" href="#fa-evals" data-id="leaked_call.retried_not_shipped">a tool call written as prose is handed back</a> rather than shipped. <a class="act" href="#fa-evals" data-id="horizon.early_lookup_survives">The sixteen-lookup turn</a> clears its older results as it works and still answers with the first.
