---
layout: post
title: "One world, two players"
article_class: post-minecraft post-minecraft-multi
kicker: "How Minecraft works / Part 2"
description: >-
  Trace multiplayer through the Minecraft 26.3 JAR, then build a real browser
  server: joining, shared edits, prediction, conflicts, movement, and saved worlds.
date: 2026-10-26 13:00:00 -0400
excerpt: >-
  Two players swing at the same block. Their screens need to agree about what
  happened. A look inside Minecraft multiplayer, rebuilt in the browser.
tags: [minecraft, networking, reverse-engineering, game-development]
styles:
  - /assets/css/minecraft-play.css
  - /assets/css/minecraft-polish.css
  - /assets/css/minecraft-build.css
  - /assets/css/minecraft-multiplayer.css
scripts:
  - /assets/js/minecraft-story.js
  - /assets/js/minecraft-play-core.js
  - /assets/js/minecraft-build-core.js
  - /assets/js/minecraft-play-render.js
  - /assets/js/minecraft-multiplayer-core.js
  - /assets/js/minecraft-multiplayer.js
---

The world from [Part 1]({% post_url 2026-10-26-taking-minecraft-apart-one-block-at-a-time %}) remembers the holes we dig, lets us walk through them, and carries torchlight into the next room. Now someone else joins. We both reach for the same block, almost at the same time. The world needs one answer about what happened.

I went back into the **Java Edition 26.3 JAR** to follow that answer through the connection listeners, block-action handlers, prediction records, remote-player updates, and save code. This time we’ll build a server as well as a client. The examples use an original WebSocket/JSON protocol and the same small landscape from Part 1, with real connections behind the diagrams.

Start with two copies of that world. Mine in the first one. The other copy has no way to know anything changed yet.

<figure class="fig wide" id="mn-copies" data-minecraft-build="true" data-multi-stage="0">
<div class="ms-figure-head"><span class="ms-figure-index">00 / 07</span><strong>The same hillside, twice</strong><span class="ms-figure-meta">Two copies, two answers</span></div>
<figcaption>These first two arrays are independent. Removing the reference block changes the first copy. We need a connection before another player can see that edit.</figcaption>
</figure>

## 1. Get a browser into the world

Opening a connection only gives us a way to exchange bytes. The client still needs to know who it is, which world it joined, and when that world is ready to play.

In the JAR, the handshake chooses an intention such as login or status. `ServerLoginPacketListenerImpl` handles identity and login policy, including authentication when the server requires it. Configuration follows: feature flags, registry synchronization, and spawn preparation. The connection enters PLAY after those steps finish.

Our browser build has a smaller setup. A WebSocket opens, the browser asks to join a room, and the server replies with a player ID, the current block array, inventory, and player records. We validate that snapshot before enabling play. Each room begins with the same hillside; it then keeps its own edits.

<figure class="fig wide" id="mn-connect" data-multi-stage="1">
<div class="ms-figure-head"><span class="ms-figure-index">01 / 07</span><strong>Join before you play</strong><span class="ms-figure-meta">Connection → snapshot → ready</span></div>
<figcaption>Connect to the running cave server. The browser receives all 8,192 cells and its own player record. The room code identifies this shared world.</figcaption>
</figure>

Minecraft sends much more than this. `PlayerList.placeNewPlayer` initializes the player and world parameters, while `PlayerChunkSender` streams ready chunks in batches. A login packet is not the whole landscape. Our tiny world fits in one snapshot, so we can keep the state transition visible without implementing the full registry and chunk codecs.

## 2. Give the second client the current world

A joining player needs the world as it is now. Replaying an old list of edits would leave us deciding where that history begins and which changes still matter. A snapshot gives the newcomer a starting point; later updates carry it forward.

Connect the second client below. It opens another WebSocket to the same server, with its own identity and inventory. These two clients live on this page so we can inspect them together. At the end, the invitation opens the same world in a separate browser for another person.

<figure class="fig wide" id="mn-second" data-multi-stage="2">
<div class="ms-figure-head"><span class="ms-figure-index">02 / 07</span><strong>Two clients, one room</strong><span class="ms-figure-meta">Current state, then live updates</span></div>
<figcaption>The second connection receives the server’s current snapshot. Both clients now follow the same room revision, including edits made before the second client arrived.</figcaption>
</figure>

Our protocol assigns a revision number to each committed block change. The server sends the changed coordinate and its new state to everyone in the room. That revision is a choice for this reconstruction; it makes the ordering easy to inspect.

## 3. Ask the server to change a block

The server owns the block array. A client can ask to mine a coordinate, but it cannot award itself cobblestone or replace the server’s blocks with its own copy.

That boundary is visible in `ServerGamePacketListenerImpl.handlePlayerAction` and `ServerPlayerGameMode.handleBlockBreakAction`. The game checks the player’s reach, world limits, protection, game mode, and mining progress. Placement goes through its own checks of the held item, hit location, and interaction rules.

Here, a break has a start and a finish. The server records the start tick and measures progress on its own **20 Hz clock**. It raycasts from the server’s player position, checks the target again, and only then changes the cell and inventory. Our small ruleset requires completed mining; the actual game also has delayed-destruction handling and finish tolerances. The next few diagrams zoom in on the same doorway.

<figure class="fig wide" id="mn-authority" data-multi-stage="3">
<div class="ms-figure-head"><span class="ms-figure-index">03 / 07</span><strong>An action becomes a shared edit</strong><span class="ms-figure-meta">Request → validate → commit</span></div>
<figcaption>This experiment restores the reference block and returns both demo clients to the wall. The first client then mines through the server. A committed edit reaches both connections.</figcaption>
</figure>

The server processes each request against the state left by the previous one. Each committed block change gets a revision, and the server applies each action’s inventory effects once. That gives us a definite order when the players start interfering with each other.

## 4. Let the client predict, then reconcile

Waiting for a network round trip before every visible change would make a pickaxe feel distant from your hand. The client can show a likely result immediately, while keeping enough information to correct it.

Minecraft’s `BlockStatePredictionHandler` retains known server state behind a predicted block change. Incoming block updates and processed-action acknowledgments travel through separate paths. The acknowledgment contains a sequence number: it says an action was processed, which can include a refused action. The authoritative block state supplies the answer.

Our client keeps **confirmed blocks + pending predictions**. A reply updates confirmed state and retires the processed prediction. We rebuild the visible array from that confirmed state plus any predictions still waiting. Our readable acknowledgment includes an explicit result as well as the sequence, instead of copying the game’s packet layout.

<figure class="fig wide" id="mn-prediction" data-multi-stage="4">
<div class="ms-figure-head"><span class="ms-figure-index">04 / 07</span><strong>Show the hole before the reply</strong><span class="ms-figure-meta">Predict → confirm or correct</span></div>
<figcaption>The slider adds delay to real server replies. Try a completed break, then try finishing immediately after starting: the second prediction opens a hole that the server refuses, so the wall returns. Both experiments reset only the reference doorway and demo viewpoints.</figcaption>
</figure>

The pending counter should return to zero after either outcome. Clearing a prediction means we received an answer; it doesn’t mean the answer was yes. The displayed delay is an experiment setting, not a measurement of Minecraft’s networking.

## 5. Make the players disagree

Now both clients start mining the same stone. Each request is plausible when it starts. Only one can remove the block that is actually there.

The first valid finish changes the server’s cell to air and awards cobblestone. The later finish finds that its mining target has changed. The server refuses that edit and returns the current state. Both clients settle on the same opening, and the room has awarded **one** piece of cobblestone.

<figure class="fig wide" id="mn-race" data-multi-stage="5">
<div class="ms-figure-head"><span class="ms-figure-index">05 / 07</span><strong>One block cannot break twice</strong><span class="ms-figure-meta">Conflicting requests, one commit</span></div>
<figcaption>Reset the doorway and send two real mining attempts. The result comes from the server’s serialized requests. This reconstruction grants the winning player an inventory item directly; Minecraft’s full drop and pickup simulation is a larger system.</figcaption>
</figure>

This is why validation happens at the moment of the edit. A target that was valid when the player pressed the button may already be gone when the finish arrives.

## 6. Send movement, draw another player

Blocks can wait for an edit message. Another player’s body keeps moving between updates. Drawing only the newest received position would make that motion jump from snapshot to snapshot.

The JAR has separate paths for your own movement and remote entities. `LocalPlayer.sendPosition` chooses which pose information to send; the server checks movement and can correct the position. `ServerEntity` handles another entity’s initial pairing data and later updates. In 26.3, position paths and `moveOrInterpolateTo` participate in those updates; this is more involved than sending an XYZ delta on every frame.

Our server receives **movement inputs** and runs the same collision function as the browser at 20 Hz. The local client predicts those steps, then replays unacknowledged input after a server correction. This input-based protocol is our design choice. Remote players are drawn from a small history of received poses, **100 ms behind** the newest receipt timeline, interpolating position and rotation between samples.

<figure class="fig wide" id="mn-movement" data-multi-stage="6" data-multi-game="true">
<div class="ms-figure-head"><span class="ms-figure-index">06 / 07</span><strong>The other player gets a body</strong><span class="ms-figure-meta">Inputs + snapshots + interpolation</span></div>
<figcaption>Walk in the shared world. “Move the second client” brings both demo clients onto the hillside and sends real movement input from the second connection. The avatar you see is rendered from its received server poses.</figcaption>
</figure>

Interpolation trades a little display delay for smoother remote motion. Its 100 ms buffer belongs to this example; it is not a recovered universal Minecraft setting. Large position changes snap rather than drawing an avatar traveling through the whole distance.

## 7. Leave, return, and invite someone

Disconnecting removes a player from the live session. It shouldn’t erase their inventory or the world they helped build.

In the JAR, `PlayerList.remove` saves the player before removing it. `PlayerDataStorage` writes player data through a temporary file and safe replacement, retaining an older file for recovery. World and chunk saves have their own path through `MinecraftServer.saveEverything`; they are separate from that player cleanup.

Our server keeps a versioned room record containing blocks and player records, written with atomic file replacement. Reconnecting with a per-player token restores the identity, pose, and inventory, then sends a fresh snapshot. That token is for this anonymous demo, separate from Minecraft account authentication. The invitation contains the room code and gives the guest a new identity.

<figure class="fig wide" id="mn-play" data-multi-stage="7" data-multi-game="true">
<div class="ms-figure-head"><span class="ms-figure-index">07 / 07</span><strong>A world you can share</strong><span class="ms-figure-meta">Two browsers, one server</span></div>
<figcaption>Create a world or enter a room code, then open or copy the invitation. The on-page second demo client leaves when you enter this final scene. Another browser joins as a real player, with its own body and inventory.</figcaption>
</figure>

Both browsers need to reach the cave server. Two tabs can use `localhost`; another device needs the host’s LAN address or a public server address. The invitation uses the server endpoint selected in the first connection step. Save to keep a version on the server, disconnect, and reconnect in the same tab to resume your player.

Try opening the doorway together. Watch the other player come through, put a torch in the next room, and leave something on the hillside for them to find. The blocks, collision, light, inventory, and saved world now have to agree across a connection. There are two screens, but one world deciding what happened.
