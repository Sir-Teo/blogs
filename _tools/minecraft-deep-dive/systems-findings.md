# Minecraft 26.3 — systems evidence

Static investigation of the official Java Edition 26.3 client JAR, released
2026-09-15. Client SHA-256:
`4508d006323f24fa02876310c192d739af56516eb259000ac50f0909a68c9a2d`.
Vineflower 1.12.0 reconstructed the Java below. No game runtime was launched.
This ledger contains paraphrases and arithmetic, not redistributed game source.
Line numbers refer to the local reconstructed Java, not Mojang's original source.

Paths below are relative to `/tmp/minecraft-deep-dive/decompiled/`, except
paths marked **extra**, which are relative to
`/tmp/minecraft-deep-dive/decompiled-extra-systems/`.

## 1. Spatial addressing and palette storage

**Observed:** `world/level/chunk/Strategy.java` (**extra**), lines 26–45,
51–71, 85–98:

- Block-state strategy uses four bits per spatial axis, hence 16³ = 4,096 entries.
- Its flattened index is `(y << 8) | (z << 4) | x`, so x advances fastest,
  then z, then y. This is a section-local index, not a whole-world address.
- Configuration uses the ceiling of log₂(distinct palette entries).
- One state takes zero bits; 2–16 states use a four-bit linear palette;
  17–32 use a five-bit hash-map palette; 33–64 six; 65–128 seven;
  129–256 eight. Above 256, the in-memory palette becomes global.
- The biome strategy uses two spatial bits per axis: a 4³ = 64-entry container.
  It allows 1-, 2-, or 3-bit linear palettes, then uses a global palette in RAM.
  This means spatial samples every four blocks; it is not one biome ID per block.

**Important 26.3 distinction:** `world/level/chunk/Configuration.java`
(**extra**), lines 5–50, separates `bitsInMemory` and `bitsInStorage`.
`Configuration.Global` uses enough RAM bits for the global registry but stores
the requested palette-width on disk. `PalettedContainer.pack`, lines 224–243,
reencodes the currently used values into a compact palette before serialization.
Do not claim that a global RAM palette necessarily writes global registry IDs
to disk. `unpack`, lines 181–220, can translate a compact stored representation
back to a global RAM representation.

`world/level/chunk/PalettedContainer.java`, lines 80–99, 116–144:
zero bits selects `ZeroBitStorage`; other configurations allocate
`SimpleBitStorage`. Lookup first reads the packed ID and then resolves it
through the palette. A newly inserted state can resize the representation,
copying/reencoding existing entries. The presence of only a few block *types*
does not imply only a few block *states*: orientation, waterlogging, and other
properties can create additional distinct states.

`world/level/chunk/LevelChunkSection.java`, lines 11–18, 35–45, 60–118:
sections contain separate block-state and biome containers, plus counts of
non-air blocks, fluids, and randomly ticking blocks/fluids. Counts allow
`hasOnlyAir` and random-tick eligibility checks without scanning every entry.

### Exact packed-array arithmetic

`util/SimpleBitStorage.java`, lines 245–263, 267–315:

- `valuesPerLong = floor(64 / b)`.
- Long-array length is `ceil(N / valuesPerLong)`.
- For entry i, long index is `floor(i / valuesPerLong)`; bit offset within
  that long is `(i % valuesPerLong) * b`.
- Entry values never straddle two longs; unused high bits are padding.
- The implementation uses precomputed multiply/shift constants for the
  division, but the arithmetic interpretation above is exact.

For N=4,096, excluding palette/NBT/compression/all object overhead:

| bits | entries per long | longs | packed payload bytes |
| --- | --- | --- | --- |
| 0 | special case | 0 | 0 |
| 4 | 16 | 256 | 2,048 |
| 5 | 12 | 342 | 2,736 |
| 6 | 10 | 410 | 3,280 |
| 7 | 9 | 456 | 3,648 |
| 8 | 8 | 512 | 4,096 |

At 5 bits, the four unused bits in each long explain why the byte count is
2,736 rather than the ideal `4096*5/8 = 2560`. At P=17 the extra state forces
every index to widen; the packed payload grows by 688 bytes relative to P=16.
These values are arithmetic derived from observed code, not measured save sizes.

## 2. Region files

`world/level/ChunkPos.java`, lines 37–40, 128–149, and
`world/level/chunk/storage/RegionFile.java`, lines 27–46, 60–64, 201–215,
285–350:

- A region covers 32×32 chunk columns (512×512 blocks horizontally).
- The file uses 4,096-byte sectors. Its first 8,192 bytes are two sectors:
  a 1,024-entry location table and a 1,024-entry timestamp table.
- Region-local location-table index is `localChunkX + 32*localChunkZ`.
- Each location value packs a 24-bit sector address and an 8-bit sector count.
- The chunk record has a four-byte length followed by a compression/version
  byte; the length includes the version byte but excludes its own four bytes.
- Payloads requiring 256 or more sectors go to an external `c.x.z.mcc` file;
  the region gets a one-sector stub whose compression byte has bit 7 set.
- Writes allocate new sectors, write the data and new header, commit any
  external-file operation, then free the previous allocation.

`RegionFileVersion.java`, lines 26–46, 77–91: supported built-in formats
include gzip ID1, DEFLATE ID2, no compression ID3, and LZ4 ID4. Default selected
compression is DEFLATE; `region-file-compression` can change it. A custom ID127
exists, but the inspected reader does not decode an unknown custom compressor.
Avoid presenting LZ4 as the default or region sector arithmetic as NBT size.

## 3. Chunk lifecycle and active simulation

**Version-sensitive:** `world/level/chunk/status/ChunkPyramid.java`, lines 11–45,
defines the actual 26.3 generation steps:

`EMPTY → STRUCTURE_STARTS → STRUCTURE_REFERENCES → BIOMES → TERRAIN → FEATURES
→ INITIALIZE_LIGHT → LIGHT → SPAWN → FULL`.

There are no separate `NOISE`, `SURFACE`, or `CARVERS` statuses in this version's
pyramid. TERRAIN requires BIOMES in radius1 and STRUCTURE_STARTS in radius8.
FEATURES requires TERRAIN in radius1 and can write blocks in radius1. LIGHT
requires INITIALIZE_LIGHT in radius1. These are scheduling/dependency radii;
they must not be confused with render distance or a maximum terrain feature size.
The loading pyramid uses many no-op stages and still initializes/lights chunks.

`server/level/DistanceManager.java`, lines 38–55, 110–155, 267–288:
there are distinct loading and simulation trackers and distinct PLAYER_LOADING
and PLAYER_SIMULATION tickets. Moving/adding/removing players changes ticket
state. View distance changes the loading player tracker; simulation distance
changes the simulation ticket level. Entity- and block-ticking eligibility are
separate queries of the simulation tracker. The throttling dispatcher is built
with a limit of four. This is a task dispatch limit, not four total loaded chunks.

`ServerLevel.java`, lines 437–454, ticks non-player entities only if the
distance manager says their chunk is entity-ticking; players have a special path.
Consequently, a loaded/visible chunk need not be a fully simulated chunk.
Do not reduce all chunk lifetimes to a single circle around the camera: ticket
types and dependency state matter.

## 4. Tick loop, scheduled work, and random work

`world/TickRateManager.java`, lines 7–17, 56–64:
default target is 20 ticks/s, i.e. 50 ms per tick. Tick rate is mutable, with
a minimum of one; freezing/stepping affect which game elements run. It is
incorrect to imply 20 Hz is an immutable physical constant of the engine.

`server/MinecraftServer.java`, lines 712–760, 996–1004:
the server schedules ticks against a nanosecond deadline, processes queued
packets before `tickServer`, runs the tick, and waits/does tasks until the next
deadline. Sprint mode has special zero-wait logic. The overloaded warning path
can adjust its scheduling deadline after falling far behind; it does not
retroactively execute skipped world updates. A constant-cost model
`effectiveTPS≈min(20,1000/costMs)` is useful for teaching but is not a measured
runtime trace or a complete model of this scheduler.

`MinecraftServer.tickChildren`, lines 1079–1135, ticks command functions,
clocks, levels, connections/players/debug systems, and chunk sending. There is
no universal promise that all Minecraft subsystems are independent parallel jobs.

`server/level/ServerLevel.java`, lines 364–465, 507–545:

- Scheduled block ticks and fluid ticks are separate queues, each processed
  with a 65,536-per-tick limit in an ordinary non-debug, running world.
- These are not scans over every block. `LevelTicks` looks at chunk containers
  with due work and applies its chunk tick eligibility predicate.
- Random ticking is distinct. For each section flagged as randomly ticking,
  the engine performs `tickSpeed` random local position trials; only a selected
  block/fluid that requests random ticking receives its callback.
- A selected position is not guaranteed to receive a random update once
  every fixed number of ticks. Repeated random draws can hit the same location.

`world/ticks/LevelTicks.java`, lines 81–120, 126–190, collects due ticks from
eligible chunk containers, respects a maximum, and then executes the collected
work. `ScheduledTick.java`, lines 9–34, gives trigger time, priority, and
sub-tick order; its full drain comparator sorts in that order. Once due work
is being merged across containers, the intra-tick comparator uses priority then
sub-tick order. Do not assert a single global immutable order based only on xyz.
`LevelChunkTicks.java`, lines 20–22, 43–62, deduplicates scheduled work by
position+type; `ScheduledTick.UNIQUE_TICK_HASH` establishes this identity.

Autosave: `MinecraftServer.java`, lines 1008–1034, targets approximately
300 seconds by computing a tick interval from current target tick rate (or
estimated sprint throughput), with a 100-tick minimum. At default target it
is 6,000 ticks. Do not claim every block change synchronously writes its
region sector or that autosaving is always exactly every five wall-clock minutes
on an overloaded server.

## 5. Breaking a block: client prediction and authority

Client route:

- `client/multiplayer/MultiPlayerGameMode.java` (**extra**), lines 156–212,
  starts destruction. Creative/instant mining can immediately predict removal.
  Ordinary mining initializes progress and sends START_DESTROY_BLOCK.
- Lines 234–295 accumulate local progress. At completion the client predicts
  removal and sends STOP_DESTROY_BLOCK. `startPrediction` opens a prediction
  scope, obtains its incrementing sequence, applies the predicted action, then
  sends the concluding action packet.
- `network/protocol/game/ServerboundPlayerActionPacket.java`, lines 16–43,
  carries action, block position, face direction, and a VarInt sequence.
  This is an action request, not an authoritative instruction to replace a block.

Server route:

- `server/network/ServerGamePacketListenerImpl.java`, lines 1397–1403,
  dispatches the action to `ServerPlayerGameMode.handleBlockBreakAction` and
  records the sequence as processed. Lines 313–317 send a cumulative sequence
  acknowledgment during connection ticking; lines 1554–1559 keep the maximum.
- `server/level/ServerPlayerGameMode.java`, lines 164–264, checks interaction
  range, world height, spawn protection, interaction rules, game mode, and
  mining progress. A completed STOP request can be accepted at computed
  progress≥0.7; otherwise it can continue as delayed destruction, so a simple
  client-completion/server-completion equality claim is wrong.
- Lines 278–325 distinguish success from failure and send a block state
  correction if destruction fails. `destroyBlock` invokes block/tool/drop
  behavior and removes the block from the authoritative world.

Authoritative mutation is a fan-out, not just changing a byte:

- `world/level/Level.java`, lines 220–265, writes through its chunk, dirties
  the visual block state, conditionally sends an update, notifies neighbors,
  updates neighbor shapes, and updates points of interest according to flags.
- `Level.removeBlock`, lines 272–274, replaces the block with the fluid's
  legacy state. A waterlogged block therefore need not become plain air.
- `world/level/chunk/LevelChunk.java`, lines 274–355, resolves local coordinates
  with `&15`, updates its section palette, updates heightmaps, notifies the light
  engine if light properties differ, handles block entities and placement/removal
  hooks, and marks the chunk unsaved.
- `server/level/ServerLevel.sendBlockUpdated`, lines 1142–1150, marks the
  changed block in the server chunk source. Actual network batching can use a
  single block packet or section update packet; timing is not established here.

Client reconciliation:

- `ClientPacketListener.java`, lines 861–863 and 946–948, sends both section
  updates and individual block updates into `ClientLevel.setServerVerifiedBlockState`.
  Lines 2474–2476 route sequence acknowledgments into the level.
- `client/multiplayer/ClientLevel.java` (**extra**), lines 190–244,
  retains old server state when prediction changes a block; incoming server
  updates can replace this retained state rather than immediately overwriting
  the predicted visual state. On acknowledgment it resolves outstanding predictions.
- `BlockStatePredictionHandler.java`, lines 18–62, stores states by packed
  block position and tracks sequence numbers. Ending predictions up to a
  sequence restores/synchronizes retained authoritative states and removes
  the records. `ClientLevel.syncBlockState` may reposition a player if the
  restored block would collide with them.

**Important:** an action acknowledgment says the server has processed action
sequences; it does not itself contain the accepted new block state or mean
the action succeeded. A timeline with artificial latency must be labeled an
illustration, not a packet capture. No exact RTT, mesh latency, persistence
latency, or render frame rate was measured in this static investigation.

## 6. Collision: optional supporting section

`world/entity/Entity.java`, lines 1189–1217, 1247–1313, gets candidate voxel
shapes from block/entity/world-border collision queries, resolves attempted
movement against them, and considers step-up heights when horizontal movement
is blocked while grounded. It uses AABBs for broad spatial bounds, but nearby
block geometry can contain multiple partial cuboids, not only full cubes.

`Entity.collideWithShapes`, lines 1296–1313, resolves movement one axis at a
time and shifts the bounding box by already-resolved movement before clipping
the next axis. `core/Direction.axisStepOrder` (**extra**), lines 389–390,
chooses Y-Z-X when |dx|<|dz| and Y-X-Z otherwise: vertical first, then the
larger horizontal component. A simplified 2D rectangle example can accurately
teach clipping, but must not imply it includes fluids, stepping, vehicles,
all entity rules, or floating-point tolerance behavior.

## Coverage

Answered: section addressing, palette thresholds, bit packing, region layout,
default compression, chunk lifecycle, loading/simulation separation, default
tick target, scheduled/random work, client prediction/authority/reconciliation,
and mutation fan-out. Partially answered: precise chunk update packet batching
and persistence scheduling, for which the inspected code establishes queues
and dirty state but not measured latency. Not investigated: complete protocol
catalogue, all gameplay mechanics, all physics branches, runtime performance,
or Bedrock Edition. All conclusions above describe 26.3 Java Edition.
