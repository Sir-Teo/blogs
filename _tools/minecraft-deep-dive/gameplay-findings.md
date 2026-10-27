# Gameplay subset — mining, selection, movement, and light

Static inspection of the same official Java Edition 26.3 client, SHA-256
`4508d006323f24fa02876310c192d739af56516eb259000ac50f0909a68c9a2d`.
Vineflower 1.12.0 ran with the existing OpenJDK installation. Minecraft was not
launched. This file paraphrases behavior rather than distributing game source.

Additional scratch decompilation:
`/tmp/minecraft-gameplay-research/decompiled/net/minecraft/`.

## Mining is progress on a continuing target

- `client/multiplayer/MultiPlayerGameMode.java`, original combined output
  lines 234–295: an ordinary continuing destruction action adds one
  block-state destruction-progress increment per game tick. Completion predicts
  removal, sends the concluding action within its prediction sequence, clears
  destruction progress/ticks, and sets a five-tick destruction delay.
- Changing target enters the start-destruction path; aborting clears progress.
  Break-stage feedback maps accumulated progress to an integer stage in the
  inspected `getDestroyStage` path, lines 569–571.
- `world/level/block/state/BlockBehaviour.java`, new output lines 350–357:
  progress divides the player's effective mining speed by block hardness and
  by 30 when the player has a correct tool for drops, or by 100 otherwise.
  An unbreakable hardness of minus one yields zero progress.
- `world/entity/player/Player.java`, lines 590–620: the selected item supplies
  base mining speed. Attributes, efficiency, haste, fatigue, submersion, and
  ground state can modify it. Being airborne divides speed by five.
- `world/item/ToolMaterial.java`, line 27: iron's mining speed is six.
  Its tool component uses a rule for the efficiently mined block tag and a
  default speed of one for other blocks. `Items.java`, line 1678, constructs
  the iron pickaxe from this material.
- `world/item/component/Tool.java`, lines 39–56: matching rules supply speed
  and correct-for-drops results; otherwise the defaults apply.
- `world/level/block/Blocks.java`, lines 69–72: ordinary stone has hardness
  1.5 and requires a correct tool for drops. Dirt has hardness 0.5, grass 0.6;
  the log helper uses two and the leaves helper uses 0.2. The torch registration
  marks it non-colliding, instantly breakable, and emitting level fourteen.
- Original resource `data/minecraft/tags/block/mineable/pickaxe.json` contains
  stone. `incorrect_for_iron_tool.json` references `needs_diamond_tool.json`,
  whose listed entries do not include stone.
- `Blocks.java`, lines 107–110: cobblestone requires a correct tool and has
  hardness two. The pickaxe tag also includes cobblestone. Numeric material nine
  uses these properties for placed blocks.
- `data/minecraft/loot_table/blocks/stone.json` selects stone when the tool
  satisfies `minecraft:tool/can_silk_touch`; its fallback item is cobblestone,
  subject to the explosion-survival condition. Ordinary iron-pickaxe mining in
  the illustration therefore awards cobblestone. The controller handles this
  item award; the pure progress helper does not evaluate loot tables.

At the default 20 Hz target, grounded, unenchanted, dry mining therefore has:

| Example | Per-tick increment | Completion |
| --- | --- | --- |
| Stone, iron pickaxe | 6 / 1.5 / 30 | eight ticks, approximately 0.4 s |
| Stone, hand | 1 / 1.5 / 100 | 150 ticks, 7.5 s |
| Cobblestone, iron pickaxe | 6 / 2 / 30 | ten ticks, 0.5 s |
| Cobblestone, hand | 1 / 2 / 100 | 200 ticks, 10 s |
| Dirt, ordinary pickaxe/hand | 1 / 0.5 / 30 | fifteen ticks, 0.75 s |
| Grass, ordinary pickaxe/hand | 1 / 0.6 / 30 | eighteen ticks, 0.9 s |
| Log, ordinary pickaxe/hand | 1 / 2 / 30 | sixty ticks, 3 s |
| Leaves, ordinary pickaxe/hand | 1 / 0.2 / 30 | six ticks, 0.3 s |

`MinecraftPlayCore.miningProgress` implements this deliberately bounded subset.
It quantizes elapsed time to default-rate ticks, accepts the article's numeric
materials or names, and treats material seven as the reference stone. It does
not implement enchantments, fatigue, haste, submersion, tool durability, drops,
or the entire mutable-tick-rate simulation. The caller handles target changes
and post-break delay.

## Playable selection and movement

The prior source ledgers establish ordered grid traversal and axis-separated
collision, with vertical motion first and the larger horizontal component next.
The playable core implements these mechanisms for the article's full cubes,
plus a narrow upright selection box for its torch. This is not the complete
voxel-shape, fluid, interaction-override, entity, or stepping implementation.

The movement controller uses a 0.6-wide, 1.8-high player, walking speed 4.3
units/s, sprint speed 5.6, jump velocity seven, and gravity twenty. The resulting
unobstructed jump is about 1.2 blocks. These are responsive illustration tuning,
not a claim that all continuous parameters match vanilla's discrete physics.
Simulation steps cap at 50 ms and use swept axis clipping to prevent crossing
a wall or floor when input or frame time is large.

## Recomputed lighting

The core scans real article torch cells (material eight) for level-fourteen
sources; mining a torch removes that source. Optional explicit sources can also
be supplied. Direct open-sky columns remain at fifteen until an opaque cube;
six-neighbor lateral propagation loses one per step. The two stored arrays are
x-contiguous: `(y * depth + z) * width + x`.

This is a recomputed full-cube model. It does not reproduce incremental decrease
queues, shape transmission, arbitrary attenuation, neighboring chunk storage,
or the complete vanilla sky engine. The renderer samples its block/sky channels
for a responsive visual explanation.

## Reproduction additions and checks

Add top-level classes `BlockBehaviour`, `Player`, `Blocks`, `ToolMaterial`,
`Tool`, `Items`, and `Item`, including their nested classes, to the existing
reproduction selection. Preserve the three block tags named above as additional
resource evidence, along with `data/minecraft/loot_table/blocks/stone.json`.
The original archive identity remains unchanged.

Standalone checks run from `/tmp/minecraft-play-core-check.cjs` passed seven
groups: all six ray axes and finite reach; narrow torch hits; the specified
initial ray hitting reference (8,7,7); floor/wall/diagonal clipping; jump peak,
ceilings, fast falling, patch bounds and frame-step cap; source removal and sky
columns; and the verified mining thresholds. No browser or game runtime was
needed for these pure-model checks.
