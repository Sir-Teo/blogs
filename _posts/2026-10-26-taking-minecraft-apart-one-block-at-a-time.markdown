---
layout: post
title: "How Minecraft works"
article_class: post-minecraft
kicker: "From an empty grid to a playable world"
description: >-
  A look inside Minecraft Java Edition 26.3, from decompiled classes to a
  playable browser world with blocks, movement, lighting, and saved edits.
date: 2026-10-26 09:00:00 -0400
excerpt: >-
  I’ve always wondered how Minecraft actually works. So we decompiled the
  latest stable Java Edition JAR and dug through the systems behind the blocks.
tags: [minecraft, graphics, game-development, world-generation]
styles:
  - /assets/css/minecraft-play.css
  - /assets/css/minecraft-polish.css
  - /assets/css/minecraft-build.css
scripts:
  - /assets/js/minecraft-story.js
  - /assets/js/minecraft-play-core.js
  - /assets/js/minecraft-build-core.js
  - /assets/js/minecraft-play-render.js
  - /assets/js/minecraft-play.js
  - /assets/js/minecraft-build.js
---

I’ve always wondered how Minecraft actually works. A few swings of a pickaxe can open a doorway, change where you can walk, and let torchlight into the next room. I wanted to understand how the code connects those pieces.

So we took the latest stable Java Edition JAR available when we started, **26.3**, decompiled the relevant classes, and dug through the systems behind block storage, terrain generation, simulation, rendering, and saves.

This post works through what we found by rebuilding the core ideas in a small JavaScript world you can play in your browser. We’ll start with an empty grid and add one system at a time. It’s the same world throughout: a hole you dig in one view will still be there in the next. Follow the steps in order, or jump ahead and the example will build the pieces it needs.

<figure class="fig wide" id="mc-grid" data-minecraft-build="true" data-build-stage="0" data-scene-label="An empty sixteen by sixteen ground grid, with no stored blocks. Drag or use arrow keys to rotate.">
<div class="ms-figure-head"><span class="ms-figure-index">00 / 08</span><strong>Start with nothing</strong><span class="ms-figure-meta">Coordinates, then a world</span></div>
<figcaption>Our starting point: an empty grid, with air in every cell.</figcaption>
</figure>

## 1. Store a world of blocks

Before we can draw a block, the world needs to remember where it is. We’ll give each kind of block a number and store those numbers in an array. Zero means air; the other values stand for stone, dirt, grass, and the rest. Later, drawing a wall and walking into it will both depend on reading the right cell.

Minecraft groups its blocks into 16 × 16 × 16 sections. We’ll use two sections stacked on top of each other, giving us **16 × 32 × 16 cells**. The `Uint16Array` uses two bytes per cell, so these 8,192 cells take **16 KiB** before any compression. We store x positions next to each other, then z rows, then y layers. A short formula turns each `(x, y, z)` address into an array index:

```js
const STONE = 7;
const blocks = new Uint16Array(16 * 32 * 16);
const index = (x, y, z) => (y * 16 + z) * 16 + x;
blocks[index(8, 7, 7)] = STONE;
```

Write the first block below. Its address is **(8, 7, 7)**, which lands at index **1,912** in the array. Keep an eye on the amber marker. The world will grow around this block, and eventually we’ll mine it out of a cave wall.

<figure class="fig wide" id="mc-palette" data-build-stage="1">
<div class="ms-figure-head"><span class="ms-figure-index">01 / 08</span><strong>One address. One block.</strong><span class="ms-figure-meta">Air → stone</span></div>
<figcaption>Write a stone block, then clear it. You’re changing the cell that the pickaxe will reach later.</figcaption>
</figure>

Most of a stone-filled section repeats the same value. A palette saves space by listing the block states present and storing smaller indices into that list. We can add that later; the rest of the game only needs a way to read and change a block at a coordinate.

## 2. Turn coordinates into terrain

Placing every block by hand would take a while, even in this little world. A generator fills the grid by deciding what belongs at each coordinate.

Start with a function that gives the ground height at `(x, z)`. Then `height(x, z) − y` is positive below the surface and negative above it. Smooth changes in height give us hills. We combine the terrain and cave fields with `density = min(height − y, caveField(x, y, z))`. Positive density becomes solid; zero or negative density leaves air. A few material rules put grass on top, dirt beneath it, and stone farther down; trees and a small pool finish the scene.

Generate the landscape below. Our amber block is now part of the cave wall. This is the terrain we’ll keep working with, so any holes you dig from here on belong to you.

<figure class="fig wide" id="mc-density" data-build-stage="2">
<div class="ms-figure-head"><span class="ms-figure-index">02 / 08</span><strong>Fill the grid with a landscape</strong><span class="ms-figure-meta">Coordinates → block states</span></div>
<figcaption>One corner is cut away so you can see the cave. The gray view shows which cells are filled; their materials are already stored in the array.</figcaption>
</figure>

Minecraft takes terrain generation much further, with biomes, more noise fields, and rules for placing features. Our generator makes the same small hillside each time. Once it has filled the array, its job is done. Mining changes those stored blocks without asking the generator to put them back.

## 3. Turn blocks into a mesh

Most of the stone in our hillside is buried against other stone. Drawing all those hidden faces would waste work. We need a mesh: a collection of vertices and triangles describing the surfaces we can see.

For each block, check its six neighbors. Skip a face if an opaque neighbor covers it. Keep the exposed faces, turning each square into two triangles:

```text
for each block:
    for each face:
        if the neighboring block does not cover it:
            append four vertices and two triangles
```

Build the mesh and look at the cave wall. The grid lines mark the faces we kept. The counts below are for this cutaway, including the surfaces revealed by removing its corner.

<figure class="fig wide" id="mc-mesh" data-build-stage="3">
<div class="ms-figure-head"><span class="ms-figure-index">03 / 08</span><strong>Keep the surfaces you can see</strong><span class="ms-figure-meta">Blocks → faces → triangles</span></div>
<figcaption>The hillside gets its colors and surface mesh. Drag to turn it and look inside the cave. Mining a block later will change these faces too.</figcaption>
</figure>

WebGL uploads the mesh into a vertex buffer. Each vertex carries a position, texture coordinates (UVs), and a color used for shading. A view-projection matrix maps its position into clip space; the fragment shader samples a texture atlas and applies the shading. The surface patterns here are generated for this example.

We still keep the block array. If the mesh gets out of date after an edit, we can rebuild it from those blocks.

## 4. Put a player inside

So far, we’ve been looking at the world from outside. To stand on the hillside, we need a player with a body that the ground can support.

Ours is an **axis-aligned bounding box (AABB)**, **0.6 blocks wide** and **1.8 blocks tall**, with a camera near the top. Collision sweeps the box through nearby solid cells, clipping vertical movement first and then the horizontal axes. That lets the player slide along a wall while stopping the part of the movement that would enter it. Gravity pulls the body down; a jump gives it an upward push.

Add the player and take a walk. Try bumping into a tree or jumping up a block. You can also head back to the cave wall. The pickaxe comes next.

<figure class="fig wide" id="mc-player" data-build-stage="4" data-gameplay="cave" data-spawn="surface">
<div class="ms-figure-head"><span class="ms-figure-index">04 / 08</span><strong>Step into the landscape</strong><span class="ms-figure-meta">Camera + body + collision</span></div>
<figcaption>You’re standing on the hillside we generated. Use WASD to walk, the arrow keys to look, and Space to jump. On a phone, move with the stick and drag to look.</figcaption>
</figure>

The browser may draw frames at different rates on different devices. Movement uses short time steps so a long frame doesn’t carry the player through a wall. And because collision reads the block grid, removing a wall block will make that space walkable. We won’t need a separate rule to recognize a doorway.

## 5. Give the player a pickaxe

A pickaxe needs to know which block you’re pointing at. We cast a ray from the camera using grid traversal (DDA), stepping to the next x, y, or z cell boundary. The first block shape it hits within our **4.5-block reach** becomes the target. Breaking uses that cell; placing uses the empty cell beside the face you hit.

Mining also takes time. Our action loop runs at **20 ticks per second**, separately from drawing frames. An accumulator turns elapsed time into fixed 50 ms steps. With the iron pickaxe, this stone takes eight ticks—0.4 seconds—to break while you’re standing on the ground. Release the button or aim at another block, and that attempt starts over.

<figure class="fig wide" id="mc-ticks" data-build-stage="5" data-gameplay="cave">
<div class="ms-figure-head"><span class="ms-figure-index">05 / 08</span><strong>Change the world, one block at a time</strong><span class="ms-figure-meta">Raycast + ticks + inventory</span></div>
<figcaption>Hold click or F to break the outlined block. You’ll need to mine the block below it as well before you can walk through. Press 2 for cobblestone, then right-click or press E to place it.</figcaption>
</figure>

When the block breaks, its cell becomes air and you get a piece of cobblestone. Placing a block reverses that exchange: one item leaves your inventory, and an empty cell becomes solid. The placement check keeps you from building a block through your own body.

If you go back to steps 1 and 3, you can see the changed cell and mesh. Here in the cave, you can walk into the gap once it’s tall enough. That’s most of our doorway working already. The cave is still evenly lit so we can see what we’re doing; next we’ll give that light a source.

## 6. Let light travel through it

Put a torch in one chamber and leave the other side of the wall dark. Now opening our doorway should let some light through.

The torch on the pedestal emits block light at level **14**. A queue-based flood fill spreads that value through the six face-adjacent air cells, losing one level at each step. We keep block light and skylight in separate `Uint8Array` buffers. A solid wall blocks the direct route, though light can travel around it if there’s another opening. Skylight has its own set of values: an open column can receive level 15 straight from the sky.

Add lighting below. You’ll start in the second chamber. If you’ve already opened the wall, the torch can light a path to you. If you haven’t, mine through from this side and watch the room brighten. Press 3 to place a torch of your own.

<figure class="fig wide" id="mc-light" data-build-stage="6" data-gameplay="light">
<div class="ms-figure-head"><span class="ms-figure-index">06 / 08</span><strong>Give the cave a source of light</strong><span class="ms-figure-meta">Emission + propagation + shading</span></div>
<figcaption>This step adds the pedestal torch. Open the wall, place another torch, or remove one and watch the light change. Unlit surfaces stay faintly visible so you can still find your way.</figcaption>
</figure>

After an edit, this small build recalculates both kinds of light and rebuilds the mesh. When drawing a face, it uses nearby light values and adds shading at the corners. A bigger engine can update only the affected areas to save work. The order is the same: **change blocks → update light → rebuild surfaces → draw**.

## 7. Make your changes survive

We’ve made a doorway, but so far it only exists in this page’s memory. Reloading would give us an empty grid again.

Saving serializes the world’s dimensions, blocks, inventory, and viewpoints into a versioned JSON record in `localStorage`. Before copying anything into the live array, the loader checks the format, dimensions, all 8,192 block-state values, and the saved inventory and viewpoints. Light and meshes are derived data, so we rebuild them from the restored blocks.

Try saving, changing a few blocks, and restoring. Or reload the page and choose **Restore saved world**. The save buttons are manual, so you can experiment and still return to the version you kept.

<figure class="fig wide" id="mc-region" data-build-stage="7">
<div class="ms-figure-head"><span class="ms-figure-index">07 / 08</span><strong>Keep the world you built</strong><span class="ms-figure-meta">Blocks + inventory + viewpoints</span></div>
<figcaption>Save your world here. Restore brings back its blocks, inventory, and viewpoints, including after a page reload. The save stays in this browser.</figcaption>
</figure>

Minecraft stores its much larger worlds in chunks and region files. We can keep this whole little world in one record. Either way, loading needs care: a damaged or incompatible save should leave the world you’re playing in alone.

## 8. Check an edit before accepting it

A click tells us what the player wants to do. Before changing a block, we’ll have a separate rules function check that the action is allowed.

That function validates the request against the current world before any block or inventory value changes. It checks that the camera belongs at the player’s eye position, raycasts the target again, and verifies reach and mining progress. Placement needs an item in your inventory, an empty cell, and room for the player. Keeping these checks together gives every edit a consistent set of rules.

Finish the build below and play with what you’ve made. Your earlier edits are still here. The counters show which edits this final scene has accepted or refused.

<figure class="fig wide" id="mc-world" data-build-stage="8" data-gameplay="cave">
<div class="ms-figure-head"><span class="ms-figure-index">08 / 08</span><strong>A world you can play</strong><span class="ms-figure-meta">Everything, together</span></div>
<figcaption>Dig another passage, light it, or build something on the hillside. The cutaway shows your work from outside. Save here when there’s a version you want to come back to.</figcaption>
</figure>

This is an original Minecraft-style reconstruction running entirely in your browser. The rules run locally for one player. In a multiplayer game, a server would make those decisions and send the accepted changes back to everyone playing.

There’s plenty left to add: recipes for crafting, creatures with bodies and behavior, redstone changes scheduled for future ticks. For now, try the doorway. The block array remembers the opening, collision lets you through, torchlight reaches the next room, and a save keeps it there for another visit.

In [Part 2]({% post_url 2026-10-26-one-world-two-players %}), another player joins. We follow multiplayer through the JAR and build the server that lets two browsers share this world.
