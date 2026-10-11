# FinOS-AgentLab demo data

Generators for `assets/data/finos-agentlab-demo.json`, which drives the figures
in `_posts/2026-10-10-putting-a-trading-desk-behind-a-dashboard.markdown`.
Every number comes out of FinOS-AgentLab's own code, run offline; nothing
calls a model or the network (the scripted eval suite refuses outbound
connections itself).

- `graph.py` (agents-runtime venv): builds `TradingAgentsGraph` the way
  `runner.py` does and dumps the compiled LangGraph's nodes and edges
  (conditional edges flagged). A placeholder key; the graph is never invoked.
- `runs.py` (plain Python): reads the 22 desk runs recorded in the repo's
  committed static export (`deploy/static/site/__snapshot`, 2026-09-08). Keeps
  each event's agent, stage and byte count and the error messages, never the
  prose; the two answers the guard flags are a classifier's labels and are
  kept verbatim (`said`). Runs the runner's `parse_action` over each decision
  text and `_unusable_answer` over each debate turn (with TradingAgents'
  "Bull Analyst: " label stripped first, as the guard sees the raw reply).
- `copilot_measure.py` (backend venv): `tools_for_request` for six questions
  on each of the app's ten live destinations (its nav, plus a stock page; the
  payload test still pins four retired routes, /agents, /company, /researcher
  and /studio, which are left out) and each one's pinned ceiling where it has
  one, with each tool attributed to core, the page's group or the first intent
  group whose keywords the question trips (the attribution is this script's;
  the counts and sizes are the backend's). Also the rungs of `build_messages`
  for one Dashboards turn with four widgets, and six turn sizes read from the
  scripted scenarios.
- `specialists.py` (backend venv): builds each shipped specialist's child
  TurnContext the way `CopilotLoop._research` does (ask mode, actions off,
  `only_tools`) and records what `plan_tools` hands it for one question,
  beside the parent agent-mode turn and the role allowlists. Web search is
  counted as configured so the `web` specialist is measured as declared.
- `jobs_sim.py` (backend venv): drives `jobs.tick` over one simulated week
  for the ten system jobs, state in a dict, passes stubbed to succeed or fail.
  Scenarios: a plain week, every pass failing Tue 20:30–23:30, the box down
  Wed 06:01–11:40 with the thesis scan cut off, and a Monday market holiday.
- `evals_trim.py` (backend venv): trims `python -m evals --suite core
  --scripted --json` to ids, guards, checks, tools, rounds, tokens, seconds,
  and lists the core scenarios a scripted run skips.
- `assemble.py`: merges the six files.

Run `./run.sh` with a FinOS-AgentLab checkout beside this repo (or
`FINOS=/path`), its venvs synced. The post's numbers are from commit
`9083c393` (2026-10-10). The scheduler simulation is deterministic; the
scripted evals should be too, but their `seconds` move with the machine.

## Prose tied to the shipped data

- Desk runs: 22 recorded, 10 decided (3 BUY, 5 SELL, 2 HOLD), `parse_action`
  agrees on all 10. Two bull cases are a classifier's verdict (e35b83 NVDIA,
  32 bytes; a730e0 MU, 73 bytes), both runs SELL. Twelve undecided: 4
  cancelled, 5 interrupted by a restart, 96e1c2 stalled 600 s, d14505 refused
  stale GOOGL data (latest row 2021), b4e9de bad JSON. Every finished run
  streamed only the Neutral risk voice (the older runner's risky/safe keys).
- Payload: 138 tools in the registry, 21 core (14,796 chars); "what is going
  on" on / routes 21 tools; "how is my book doing?" routes 37 and runs past
  five of the six pinned ceilings; /dashboards measures 28,923 against a
  28,950 pin. Questions that route the same tools as an earlier one are not
  drawn ("is NVDA correlated…", "what did the Fed decide?").
- Specialists: five shipped (general, market, filings, web, portfolio); for
  "Why did NVDA fall after its last earnings report?" the parent gets 32 tools
  (19,627 chars), general 31 (19,007, `research_subagent` included and refused
  at depth one), market 12 (4,960), filings 12 (6,204), web 2 (1,699),
  portfolio 7 (4,405). No child is offered any of the 21 write or 13 action
  tools. Users may declare 8, instructions ≤ 4,000 chars, rounds ≤ 8.
- Rungs: system prompt 4,998, command listing 15,962 (150 commands), policy
  1,073 (agent) / 741 (ask), context block 687, routed tools on /dashboards
  23,925.
- Scheduler: hourly jobs burn their three attempts a minute apart; the
  nightly sync (21:00 local) loses its day to the Tuesday outage; after the
  restart the thesis scan refires (fires 2), the briefs are skipped, the
  morning briefing runs at 11:40.
- Evals: 17 of the core suite's 34 scenarios run scripted, 144/144 checks (5.3 s here),
  19 check kinds; `horizon.early_lookup_survives` makes 16 calls in 4 rounds.
