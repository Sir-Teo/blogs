# Ray-query supporting evidence

Official Java Edition 26.3 client, same artifact identity as the two main
investigation ledgers. Vineflower 1.12.0; static analysis only.

Original run output: `/tmp/minecraft-deep-dive/ray-decompiled/net/minecraft/`.
The reproduction script includes these classes in its combined selection.

`world/level/BlockGetter.java:64–81`, `clip`: traverses candidate cells,
obtains the block and fluid shape using the clip context, clips both shapes,
and returns the nearer non-null intersection. `clipWithInteractionOverride`,
84–97, can replace hit direction using a closer interaction shape.

`BlockGetter.java:112–179`, `traverseBlocks`: handles equal endpoints as a
miss, nudges endpoints by small interpolation epsilon, floors starting cell
coordinates, invokes the consumer there, and computes signed axis steps plus
per-axis boundary-crossing increments. Each iteration advances along the axis
with the smallest next crossing and invokes the consumer on the new cell.
The three-axis tie branches and endpoint epsilon are part of this implementation.

The article's browser ray model is deliberately 2D, uses synthetic full-cell
solids, and stops at the first occupied cell. It teaches ordered cell traversal,
but does not claim identical ties, finite reach/endpoints, hit faces, partial
shapes, fluid handling, or interaction overrides. No game input was executed.
