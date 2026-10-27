# Minecraft 26.3: generation, lighting, and rendering evidence

This is a paraphrased static-analysis ledger, not redistributed Minecraft source.
Inspected October 26, 2026. No game process was launched for these findings.

## Artifact and analysis identity

- Mojang manifest `latest.release`: `26.3`; latest snapshot separately `26.4-snapshot-5`.
- Client URL: `https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar`.
- Client SHA-1: `e877b6a07acd633fb3bb475002175cec036e7b87` (verified against manifest).
- Client SHA-256: `4508d006323f24fa02876310c192d739af56516eb259000ac50f0909a68c9a2d`.
- Client archive: 34,227 entries, 11,383 class files; these counts include inner classes.
- Vineflower: `org.vineflower:vineflower:1.12.0`; tool SHA-256 `1dfcfe974395734fa467ce620661c7623d05ba83670de0529b1fbd63ff548b9d`.
- Main decompilation root: `/tmp/minecraft-deep-dive/decompiled`.
- Additional density/lighting classes root: `/tmp/minecraft-deep-dive/engine-decompiled`.
- Additional input `engine-selected.jar`: 144 class files, SHA-256 `36de57110e4dc4cb09e4c386af1f3ea38491500f28cb684c101856ada7b995e9`.
- The extra selection includes the `levelgen/densityfunction/` subtree, `Aquifer`, `Climate`, and `BlockModelLighter`, including their inner classes. Original client supplied as external type reference with `-e=client.jar`.
- Local Java runtime used: existing Homebrew OpenJDK 27; manifest requests major 25. This executed the decompiler, not Minecraft.

Line numbers below describe Vineflower output from this run and are navigation aids, not original Mojang source line numbers. Class paths omit `net/minecraft/` unless stated. The original bytecode and resource bytes are the authority.

## Generation

### G1. Dimension dimensions are resource facts

Archive resource `data/minecraft/dimension_type/overworld.json` has `min_y=-64`, `height=384`, `logical_height=384`, `has_skylight=true`. Thus the build-height range is -64 through 319 inclusive, with 24 sections vertically. `data/minecraft/worldgen/noise_settings/overworld.json` independently specifies noise min_y -64 and height 384, sea level 63, default solid stone, default fluid water, and `legacy_random_source=false`.

**Boundary:** dimension configuration can be customized; these are packaged vanilla Overworld settings.

### G2. This release uses compiled density samplers and volumes

`world/level/levelgen/RandomState.java:58–101` selects XOROSHIRO when the legacy flag is false, forks positional randomness from the world seed, constructs a material system, and supplies a `DensityFunction.CompileContext`. `:104–140` binds samplers to a context and exposes scalar sampling. Named noise and positional-random instances are cached (`:122–127`).

Extra root `world/level/levelgen/densityfunction/DensityFunctionCompiler.java:14–60`: a concurrent map reuses a sampler per density function. Compilation first rewrites the function graph: inlines references, prepares/reuses caches, and slices uniform axes; compilation is guarded by a lock. `compileSampler` creates sampler objects: do not describe this as a proven JVM machine-code JIT or shader compiler.

`NoiseChunk.java:21–67` is now a small context holder with a `DensityVolume`, aquifer, acquired buffer pool, and caching sampler set. It adds structure/beardifier and optional blending user fields. Closing it returns the buffer pool. **Do not describe the old large NoiseChunk interpolation state machine as this release's architecture.**

`DensityVolume.java:29–62` defaults to block step 1, has y-contiguous indexing `y + (x + z*sizeX)*sizeY`, and exposes block-coordinate mapping. These density-buffer indices are distinct from section block-state indices (x-contiguous).

### G3. Terrain is filled from a density buffer, then surfaced and carved

`NoiseBasedChunkGenerator.java:355–401`, `buildTerrain`: clamps noise settings to the height accessor, runs a background executor job, acquires the affected section containers, calls `doFill`, releases section locks, then calls `buildSurface` and `generateCarvers`.

`:404–442`, `doFill`: obtains the configured final-density sampler and samples the complete volume into a scoped float buffer. Iterates z, x, then y descending, queries the aquifer for a block state, substitutes default solid when the aquifer returns null, writes non-air states, updates world-surface/ocean-floor heightmaps, and marks selected fluid positions for postprocessing.

**Important distinction:** `D>0` indicates solid territory at the aquifer entry, but `D<=0` does not unconditionally mean air. Aquifers can supply water/lava and pressure barriers can still return default solid.

`Aquifer.java:206–214` (extra root): positive density returns null, requesting the default solid. Subsequent code evaluates the global fluid, nearby aquifer centers/statuses, and pressure barriers (`:287–338`). Disabled aquifers use the global fluid picker directly for non-positive density (`:24–38`).

### G4. The final-density expression is data, with explicit interpolation cells

Archive `data/minecraft/worldgen/density_function/overworld/final_density.json` has the following high-level composition (paraphrased mathematical tree):

`min(squeeze(interpolated(0.64 * blend_density(vertical/cave composition))), caves/noodle) + beardifier`.

The `interpolated` node declares `cell_size_xz=4`, `cell_size_y=8`. These are **node parameters** in this release, not `size_horizontal`/`size_vertical` keys on global noise settings. Its nested composition includes lower/upper vertical gradients, sloped-cheese density, entrances, cave-cheese/layers, spaghetti and pillars. Noodle carving is combined outside this interpolated branch. Structure blending is another separate term.

Archive `.../sloped_cheese.json` is a cached combination of depth, factor, jaggedness/jagged noise, quarter/half-negative transforms, and base 3D noise. The visual explanation may simplify this graph, but a sine/noise toy must not be labelled a generated 26.3 world.

### G5. Exact interpolation mathematics, with a rounding caveat

Extra root `.../densityfunction/op/InterpolatedFunction.java:16–30` decodes the explicit cell sizes and compiles a sampler. `:98–148` builds the surrounding corner-sample volume; `:150–199` fills each block cell. It lerps four corner pairs along z, lerps those values along x, then advances y by a constant float step. `:202–229` scalar sampling finds the surrounding 2×2×2 grid and uses trilinear interpolation. Negative-coordinate positioning uses floor division/modulo.

An exact *mathematical subset* figure can use synthetic eight-corner inputs and `u=x/4, v=y/8, w=z/4`. At the center each weight is 1/8. A full aligned 16×384×16 volume requires 5×49×5 = 1,225 sample-grid points for that interpolated input versus 98,304 block locations. This is derived arithmetic, **not measured runtime or an 80× whole-generator speedup**: other branches run outside interpolation, each corner can require many noise evaluations, and the implementation handles caches and buffers.

Java float volume filling has a different evaluation order from a generic JavaScript double-precision trilinear formula. Call the latter a mathematical port with synthetic inputs, not bit-identical terrain generation.

`.../op/UnaryFunction.java:216–234`, `SqueezeSampler`: clamp input to [-1,1], then evaluate `c/2 - c³/24`. This is another compact exact mathematical subset suitable for a curve figure. Squash takes place **after** interpolation in the packaged final-density tree.

### G6. Biomes are a nearest-region lookup in climate space

`world/level/biome/Climate.java:26–40,75–80`: samples six climate components (temperature, humidity, continentalness, erosion, depth, weirdness), quantizing each by 10,000 to long integers.

`:125–128`: distance to a parameter interval is zero inside it and distance to the nearer endpoint outside. `:201–230`, `ParameterPoint.fitness`: sums squared distances for six climate intervals plus squared offset. `:151–196,240–470`: builds/searches an R-tree rather than scanning every biome definition. The target includes a seventh coordinate of zero, while entries carry their offset (`:490–494`). `:474–487` converts quart coordinates back to block coordinates before sampling functions.

**Visualization boundary:** a temperature/humidity plane with a few hand-authored regions is an illustrative 2D slice of this lookup, not the actual vanilla biome table or proof that temperature alone determines a biome.

### G7. Generation dependencies are square stencils and distinguish direct from accumulated work

`world/level/chunk/status/ChunkPyramid.java:11–34`: exact generation statuses are EMPTY → STRUCTURE_STARTS → STRUCTURE_REFERENCES → BIOMES → TERRAIN → FEATURES → INITIALIZE_LIGHT → LIGHT → SPAWN → FULL. Older diagrams with separate NOISE/SURFACE/CARVERS statuses do not describe this release.

Direct requirements from `:17–28`: TERRAIN needs BIOMES through radius 1 and STRUCTURE_STARTS through radius 8, with block-state write radius 0; FEATURES needs TERRAIN through radius 1 and STRUCTURE_STARTS through radius 8, with block-state write radius 1. The center also inherits the previous stage requirement. LIGHT needs INITIALIZE_LIGHT radius 1 (`:31`).

Additional decompile root `/tmp/minecraft-deep-dive/chunkdeps-decompiled`, `server/level/ChunkGenerationTask.java:115–134`: scheduling loops x from center-radius through center+radius and z over the same inclusive interval. `:94–99` uses chessboard distance when testing dependencies. `util/StaticCache2D.java:14–18` constructs a square of side `2*range+1`. A radius-8 stencil therefore covers a 17×17 square (289 positions). A 19×19 visual can include a one-cell outer margin, but should not call all 361 positions required.

`ChunkStep.java:75–91` combines direct requirements by radius; `:114–134` computes accumulated dependencies through the parent. `ChunkGenerationTask.java:35–40` allocates a cache for the worst-case accumulated radius of EMPTY. Thus a direct stencil should not be labelled the full recursively scheduled footprint or a measured number of chunks generated. Loaded chunks can use a separate LOADING_PYRAMID.

## Lighting

### L1. Separate block and sky engines, four bits per value

`world/level/lighting/LevelLightEngine.java:14–25`: creates separate optional block and sky engines. `:148–151`: raw brightness takes the maximum of block light and sky light minus sky dampening.

`world/level/chunk/DataLayer.java:8–14,40–69`: one section's values use four-bit nibbles, x-contiguous indexing, 4,096 values in 2,048 bytes. `:71–94`: homogeneous data can stay a default value with no allocated byte array; an array is allocated on demand. Thus 2 KiB is allocated payload for a nonuniform layer, not mandatory allocation for every section.

### L2. Increasing block light is bounded propagation, not inverse-square optics

`BlockLightEngine.java:46–80`, `propagateIncrease`: visits the six directions allowed by queue-entry metadata, checks whether section light data exists, cheaply rejects candidates with `from-1 <= stored`, subtracts opacity, tests shape occlusion, writes a larger level, and enqueues follow-on work while the result exceeds 1.

`LightEngine.java:78–85`: opacity is at least 1, and shape occlusion depends on the two face shapes. A simplified empty-grid model therefore has `L(q)=max(emission(q), L(p)-1 over unblocked neighbors)` with a lower bound zero, but partial block shapes and arbitrary attenuation matter in the game.

For a source of strength 14 in an unobstructed air grid, the derived steady-state value is `max(0,14-ManhattanDistance)` along reachable cells. Obstacles make shortest *unblocked path* length matter. This statement is a simplified consequence, not a runtime capture.

### L3. Removal needs invalidation before relighting

`BlockLightEngine.java:26–43`, `checkNode`: compares the block's emission with stored light, can zero the node and enqueue a decrease, and separately queues any emission. `:82–109`, `propagateDecrease`: clears dependent lower-strength neighbors, continues invalidation where needed, queues surviving emitters, and asks higher surviving neighbors to send light back.

`LightEngine.java:138–153`, `runLightUpdates`: processes changed nodes, **drains decreases before increases**, clears its chunk cache, marks new inconsistencies, and swaps the section map. Two FIFO queues store node/metadata pairs (`:30–31,176–195`). Queue metadata includes source strength and direction flags (`:226 onward`).

A beautiful didactic figure should show (1) stale light removed, (2) surviving sources relight. Recomputing a shortest-path field from scratch is useful but must be labelled a simplified model rather than a port of this incremental queue machinery.

### L4. Direct skylight has column-source bookkeeping

`SkyLightEngine.java:34–79`: source level is 15 and each column has a lowest source y obtained from `ChunkSkyLightSources`. `:82–137` removes/adds direct sky sources when that boundary changes; unblocked source cells are explicitly assigned level 15. `:140–175` then propagates ordinary light to neighbors, with additional optimizations for empty sections and borders elsewhere.

Do not model sky light as one point source that loses one unit for every vertical air block. Closing a roof changes the column source boundary and triggers both invalidation and neighbor propagation.

## Rendering

### R1. Section compilation emits model geometry, with separate fluid work

`client/renderer/chunk/SectionCompiler.java:55–116`: loops the 16×16×16 positions from section origin through origin+(15,15,15). Non-air blocks can mark the visibility graph opaque, register block entities, tessellate fluid, then tessellate a block model. Block render origin coordinates are section-relative. Model seed depends on block state and position.

`:65–74`: output is grouped by material's `ChunkSectionLayer` (or forced opaque solid). `:118–132`: builds a mesh per started layer, sorts translucent quads, clears lighter caches, and resolves section visibility. `:135–145`: starts buffers with quad primitive topology.

The inspected classes import the RenderPearl GPU abstraction. Do not describe this release as necessarily the old OpenGL-only backend without examining backend/runtime evidence.

### R2. Face rejection happens on baked model parts, not arbitrary cube merging

`client/renderer/block/ModelBlockRenderer.java:49–75`: seeded model part selection; chooses ambient-occlusion path only if enabled, non-emissive, and the first part requests it. Both rendering paths loop directional quads, memoizing face visibility for the six directions (`:98–191`). Quads associated with no cull direction are emitted independently (`:137–140,186–189`). `:193–200` delegates directional visibility to `Block.shouldRenderFace(state,neighborState,direction)` when culling is enabled.

This path supports hidden-face rejection but **does not establish a generic greedy mesher**. A 16³ fully solid collection of full cubes has 24,576 individual cube faces and 1,536 external unit faces by simple arithmetic. Such a figure demonstrates surface-versus-volume scaling on simplified cubes; actual models, textures, fluid interfaces and light vary.

### R3. Ambient occlusion and propagated light are separate computations

Extra root `client/renderer/block/BlockModelLighter.java:32–197` samples side/corner neighbors, handles blocked corner cases, computes per-corner shade brightness and blends light coordinates. For partial/noncubic faces it uses geometry-dependent weights, so the common 0fps three-neighbor integer AO rule is **not this complete implementation**.

The default path `ModelBlockRenderer.java:65–68` switches between AO and flat tessellation. A visual can isolate propagated brightness from local neighbor darkening, while labeling any greatly simplified corner rule.

### R4. Compilation and GPU upload are separate stages

`client/renderer/chunk/SectionRenderDispatcher.java:86–108`: tasks use acquired buffer packs and return packs to a pool. `:144–162`: explicit staged terrain-buffer upload to GPU and executor scheduling. `:298–313`: exposes both async and synchronous compilation entry points. `:407–480`: compile task can be cancelled; compiles a region snapshot, builds the mesh result, stages layer buffers, and closes intermediate CPU mesh data.

`:490 onward`: transparency resort is its own task, conditioned on mesh/translucent state and changed point of view. Camera movement can require reordering translucent quads without rerunning terrain generation.

## Coverage and remaining uncertainty

This report inspected the named generation, lighting, biome, and section-compilation paths and original resources. It does not claim whole-game source recovery, exact behavior for all blocks, shader/backend analysis, measured runtime performance, visual equivalence with Minecraft, or execution-order guarantees across independent threads. Carvers, material rules, feature placement, structure generation and dynamic block-entity rendering are described only where their calls occur; their internals need additional evidence if expanded.

For public article visuals, mark exact arithmetic subsets, conceptual/synthetic demonstrations, and original-resource facts separately. Keep downloads/decompilation local; commit only original prose, reproduction scripts, hashes, and purpose-built figure code.
