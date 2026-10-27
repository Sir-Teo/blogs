# Additional findings for the visual edition

Same official 26.3 client SHA-256 as the initial investigation:
`4508d006323f24fa02876310c192d739af56516eb259000ac50f0909a68c9a2d`.
No Minecraft process was launched.

## Repeater scheduling

Vineflower 1.12.0 output originally inspected under
`/tmp/minecraft-deep-dive/repeater-decompiled/net/minecraft/world/level/block/`.

- `RepeaterBlock.getDelay`, lines 47–49, returns the configured DELAY multiplied
  by two. The property values one through four therefore supply two through
  eight game ticks to this path.
- `DiodeBlock.checkTickOnNeighbor`, lines 81–98, tests lock status, compares
  current and desired power, avoids a tick already due this tick, selects
  priority, and schedules using `getDelay`.
- `DiodeBlock.tick` separately handles current power and current input; pulse
  behavior and locking are richer than the sustained-input figure.

The figure uses straight-wire equilibrium values plus a continuously powered,
unlocked repeater. It does not simulate arbitrary circuits, update-order quirks,
short pulses, locking, or every diode branch.

## Package inventory

`build-package-data.py` reads the verified client ZIP directory. It measures
32,878 ordinary files, 1,349 directory entries, and 11,383 class files. Folder
sizes use original uncompressed member byte lengths. The browser atlas keeps
folder aggregates through depth six, not source/resource contents. Tests verify
every parent equals the sum of its children for bytes, files, and classes.

## Coverage boundary

`assets/data/minecraft/coverage.json` maps 49 findings from the original ledgers
and this supplement to 25 figures. This means coverage of the investigated
mechanisms, not a claim that every class or every Minecraft feature was read.
RAM/disk representation differences, section counters, record compression and
the complete version/source boundaries remain available in expandable notes.
