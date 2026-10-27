# How Minecraft works

Research and verification for the October 26, 2026 article. Everything here is
original explanation or tooling; downloaded game files stay outside the repository.

The article builds one shared 16 × 32 × 16 block world through nine figures,
numbered 00–08. It starts with an actually empty Uint16Array. A first cell,
terrain, surface mesh, player movement, mining/inventory, two-channel lighting,
browser persistence, and local edit authority are added in order. Skipping to a
later step constructs its prerequisites. The last figure is a playable original
Minecraft-style browser reconstruction, not the official game or a full port.

`minecraft-build-core.js` owns canonical storage, projections, versioned save
validation, and pure local action validation. `minecraft-build.js` coordinates
the build and real localStorage save/restore. All gameplay figures and cutaways
read the same world; stage-specific feature gates make each addition explicit.
Movement and placement check the actual blocks. The fixed 20 Hz action loop
advances mining; the renderer updates independently. Torches are introduced at
step six and actually emit into the recomputed block-light field. Save/restore
preserves blocks, inventory, build stage, and valid viewpoints across reloads.
Saves are explicit and local to this browser. No multiplayer server is present.

Desktop play supports pointer lock, drag look, and keyboard-only input. Phones
get a movement stick and contextual actions during play. Controls release on
blur, page hide, Escape, or leaving the figure. The cutaway remains available
without WebGL. Presentation is scoped in `minecraft-polish.css` and
`minecraft-build.css`, with no external runtime or game artwork.

Startup paints the opening grid without creating any WebGL contexts. Static
canvases paint near the viewport; gameplay initializes its renderer only when
an unlocked scene is visible or explicitly activated. Offscreen scenes retain
their state without drawing or uploading meshes. World-version caches share
cutaway projections, face counts, and storage statistics; the procedural atlas
is generated once and reused by later renderers. Canvas dimensions are only
reset when their actual display size changes.

The notebook, implementation notes, and resources sections have been removed
from the article. The older pure research models and `coverage.json` remain in
the repository as provenance; their 49 findings refer to the retained research
catalog, not to 25 currently visible figures.

## Reproduce the evidence

```sh
python3 _tools/minecraft-deep-dive/reproduce.py
```

This resolves the official manifest, downloads **26.3** client and server,
verifies their published size/SHA-1, computes SHA-256, extracts relevant original
JSON resources, and creates a focused class selection in
`/tmp/minecraft-deep-dive-reproduction`. It does not execute the game.

To reconstruct Java, supply an existing Java runtime capable of running
Vineflower 1.12.0. On the machine used for this article:

```sh
python3 _tools/minecraft-deep-dive/reproduce.py \
  --output /tmp/minecraft-deep-dive-reproduction-java \
  --decompile --java /opt/homebrew/opt/openjdk/bin/java
```

The decompiler is pinned and checked by SHA-256. This does not install Java or
accept a Minecraft EULA on your behalf. The original investigation used existing
OpenJDK 27 to run Vineflower; 26.3 metadata requests Java 25 for the game itself.
Use `--version latest` for a *new* investigation of the current stable release;
doing so does not validate this article against that newer code. A new scratch
directory is required for a fresh decompilation.

The article's original run split decompilation across five selections while
questions were investigated. The script combines those relevant selections, so
class/method names are stable evidence anchors; formatting/line spans can vary.
`engine-findings.md` and `systems-findings.md` record paraphrases, methods,
original resource paths, and local output line spans from the original run.
The ray query additionally inspects `BlockGetter`, `ClipContext`, `Shapes`, and
`VoxelShape` in the `ray-decompiled` scratch output.

The visual expansion additionally inspects `RepeaterBlock` and `DiodeBlock`.
The combined reproduction selection contains 373 class files and 33 resources.
`supplemental-findings.md` records repeater scheduling; `gameplay-findings.md`
records the additional mining, material/tool, drop, movement, and light evidence.

Build the exact package-directory aggregates after acquiring the pinned archive:

```sh
python3 _tools/minecraft-deep-dive/build-package-data.py \
  /tmp/minecraft-deep-dive-reproduction/26.3-client.jar
```

The exported atlas contains folder aggregates, byte sizes and file counts, not
game code or resources. Its directory totals reconcile to 32,878 files plus
1,349 directory entries in the official 34,227-entry ZIP.

The client and server both contain game classes, but the code findings are from
the client JAR, including integrated-server/shared classes. The downloaded server
distribution was hash-verified, not separately decompiled or launched. The REA
archive inventory was retained locally with Evidence ID
`ev_384f4090866000deed7ad914231fd1d822b96916a4fc9a82a56c9ddbda6d2292`;
its full archive inventory is not published because it is large and unnecessary
for reproducing the focused findings.

## Retained research model boundaries

The following catalog documents the original research models. Most are no longer
mounted in the article; the progressive build described above is the current UI.

| Research model | Authority and deliberate simplifications |
| --- | --- |
| Story world | Original synthetic density landscape, cave wall, built floor, and torch pedestal. All eight main scenes reuse its target local (8,7,7), world (200,7,135), section index 1912. First-person WebGL uses original procedural textures, exposed faces, per-vertex corner occlusion, two-channel light, selection outlines, mining cracks, debris, and held tools. No Minecraft art or runtime capture. |
| Playable rules | 4.5-block DDA selection, narrow upright torch shape, full-cube swept axis collision, a 0.6-wide/1.8-high player, and tuned continuous walking/jumping. Grounded dry unenchanted mining follows inspected hardness/tool arithmetic at 20 Hz; abort/target changes reset progress, completion waits five ticks, ordinary pickaxe-mined stone awards cobblestone. Placement checks bounds, empty cells, player overlap, floor support for torches, and a small inventory. No complete entity/shape/fluid/step/loot/tool-durability simulation. |
| Coordinates | Floor division, local indexing from block-state Strategy. |
| Story palette | Exact padded local-palette arithmetic at 16/17 states; synthetic palette IDs. The selected index stays 1912; removal switches its ID 6→0. Counts exclude palette/NBT/compression/object overhead. |
| Generation | Direct 26.3 ChunkPyramid prerequisites; Chebyshev squares. Not accumulated work or measured dispatch. |
| Story density | The same constructed density landscape transitions from samples into surfaces; negative cave samples are blue. Trees are separate illustrative features. Not Minecraft noise, aquifers or seed reproduction. |
| Interpolation | Trilinear mathematics and squeeze with synthetic corners; 4×8×4 node dimensions from original resource. JS doubles differ from Java float buffer evaluation. |
| Ticks | Constant-cost scheduler illustration, nominal 20 Hz; toy interpolation. No game profiling. |
| Ray | 2D DDA; not exact BlockGetter tie/epsilon/shape/fluid behavior. |
| Story light | Recomputed six-neighbor 3D flood fill through the editable landscape. Actual torch cells emit 14; mining or unsupported torches lose their source. Separate direct sky columns stay 15 until blocked. Opening the target changes the initial other chamber from 0 to 9. The first-person meter samples block light at the eyes. Not a port of incremental decrease/occlusion/storage machinery. |
| Story surface | Exposed unit faces of the same cutaway. Separating them is illustrative; no greedy merging or full model/layer/AO pipeline. Counts can stay equal while which faces exist changes. |
| Story request | Same seven-by-ten-by-seven neighborhood on client/server. Synthetic timing; state and cumulative ack are distinct. Accepted/rejected outcomes update the shared story state. |
| Story frame | Fixed accepted-break scenario, showing CPU compilation, upload, and display separately. Work ordering is pedagogical, not a measured trace. |
| Story region | Exact slot 268 and location-byte 1072 arithmetic for chunk (12,8), with artificial occupancy and a 9,600-byte compressed payload. Save motion is illustrative. |
| Package atlas | Exact ZIP-directory sizes/counts, aggregated to depth six; byte area uses uncompressed member sizes. |
| Samplers | Actual outer expression and rewrite operations; miniature y-contiguous buffer, no live generator. |
| Aquifer | Exact global-fluid-picker/disabled-aquifer subset on synthetic cave geometry; local pressure/centers are shown as a separate unmodeled branch. |
| Biomes | Quantized six-interval fitness and offset on synthetic regions; map evaluates the small model directly rather than claiming an R-tree implementation. |
| Activity | Schematic square ticket footprints; eligibility also depends on actual tickets/readiness in the game. |
| Scheduler | Synthetic 64-position grid and scheduled events; real sections contain 4,096 positions. Exact identity/ordering concepts and source-backed queue caps. |
| Redstone | Straight-wire equilibrium plus unlocked sustained-input repeater timing; no transient pulse, locking, topology, or full evaluator reconstruction. |
| Collision | 2D AABB clipping and simplified step candidates; excludes the third axis and complete entity/shape rules. |
| Skylight | Direct level-15 columns plus simplified 2D lateral propagation; no storage/shape/border optimizations. |
| Corner shading | Full-face four-sample mathematical subset on synthetic shade samples; inset weighting is illustrative and excludes complete light packing and shape cases. |
| GPU work | Illustrative revision/cancellation/pool state machine and CPU/staging/upload/display separation; timings/pool size are not measurements. |
| Transparency | Standard source-over blending on original parallel panes; not a Minecraft shader implementation. |
| Edit consequences | Source-backed mutation fan-out on an original cave slice; effects depend on flags, state properties, and scheduling. |

## Verify the blog

```sh
node --test _tools/minecraft-deep-dive/models.test.cjs
node --test _tools/minecraft-deep-dive/gameplay.test.cjs _tools/minecraft-deep-dive/build.test.cjs
bundle exec jekyll build
```

`browser-check.cjs` exercises the built post in Chromium, collects page errors,
checks local resources, verifies figure interactions and phone overflow, and saves
desktop/mobile light/dark screenshots outside the repo. Run with a local server:

```sh
bundle exec jekyll serve --host 127.0.0.1 --port 4173
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node _tools/minecraft-deep-dive/browser-check.cjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node _tools/minecraft-deep-dive/gameplay-browser-check.cjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node _tools/minecraft-deep-dive/performance-browser-check.cjs
```

The model suites cover storage lifecycle, shared-view consistency, save
roundtrips and invalid records, local edit rules, and the underlying research
and gameplay math. Browser checks cover all nine progressive figures at
1280/390/320 px, light/dark themes, step gates, real reload persistence, errors
and overflow, plus keyboard and phone mining, collision, doorway traversal,
jumping, building, lighting, and cutaways. Screenshots go to scratch directories. The
performance check runs with 4× CPU throttling and verifies zero startup GPU
contexts, one initial figure paint, and no offscreen GPU work after edits.
Timing output is diagnostic rather than a hardware-dependent pass threshold.

Figures use native DOM, SVG, high-DPI canvas, and WebGL, with no external runtime
dependencies or game downloads in the browser. They initialize deterministically,
have keyboard-accessible controls, and do not autoplay. Play stops when its
figure leaves view, the page hides, focus leaves, or the user releases controls;
WebGL-unavailable browsers retain the cutaway. Existing unrelated posts
and their generated data are not inputs to the Minecraft models.
