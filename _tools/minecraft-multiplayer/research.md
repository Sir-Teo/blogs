# Minecraft 26.3 multiplayer — static research ledger

This investigation reuses the exact official Java Edition **26.3 client JAR**
from Part 1, including its integrated-server/shared game classes. Client SHA-256:
`4508d006323f24fa02876310c192d739af56516eb259000ac50f0909a68c9a2d`.
The separate server distribution was not decompiled or launched here.

The additional focused reconstruction uses **Vineflower 1.12.0**, SHA-256
`1dfcfe974395734fa467ce620661c7623d05ba83670de0529b1fbd63ff548b9d`,
and selects **97 class files**. Only the decompiler ran; no Minecraft game runtime
or packet capture was executed. The selected class hashes, carrier digest and
command are in `research-provenance.json`. Reconstructed Java remains outside
the repository, under `/tmp/minecraft-multiplayer-research/verified/decompiled/`.
All Java paths below are relative to its `net/minecraft/` directory. Line numbers
are positions in reconstructed Java, not original Mojang source locations.
Stable class/method names and original class-file hashes are the evidence anchors.

REA archive identity/inventory observations:

- `inspect_artifact`: `ev_44854b8a6f77d973a635b0982dbfe4c81c112ea64a0ca7302bc89c4d789a2e63`.
- Nested `inventory_artifact`: `ev_47185aa0c1490a0b69fda367fa6400f6b9b6228bfca62e973e21d7f964b39195`.
- Authority: shipped-artifact. Confidence: observed archive structure and identity.
- Full retained REA export: `/tmp/minecraft-multiplayer-research/rea-evidence.json`.
  It is intentionally not shipped: the archive graph is large, and the focused
  class-hash ledger is sufficient to reproduce the specific code findings.
- The MCP inventory response exceeded transport capacity; the completed retained
  record was exported rather than rerun or treated as a truncated analysis.
- REA archive session was closed after export.

## 1. Connecting is a state machine

**Observed in reconstructed bytecode:** `server/network/ServerHandshakePacketListenerImpl.java:25–52` (`handleIntention`); `server/network/ServerHandshakePacketListenerImpl.java:54–69` (`beginLogin`).
The handshake distinguishes login, status and transfer intentions. A login
checks the protocol version before installing the login listener.

`server/network/ServerLoginPacketListenerImpl.java:113–128` (`handleHello`); `server/network/ServerLoginPacketListenerImpl.java:135–156` (`verifyLoginAndFinishConnectionSetup`); `server/network/ServerLoginPacketListenerImpl.java:228–236` (`handleLoginAcknowledgement`).
The login listener checks its expected state and username. Depending on server
configuration and connection type, it requests a key/authentication exchange or
constructs an offline profile. It applies login policy, may configure compression,
handles duplicate-profile disconnection, sends login-finished and waits for a
client acknowledgment before switching to the configuration protocols.

`server/network/ServerConfigurationPacketListenerImpl.java:81–99` (`startConfiguration`); `server/network/ServerConfigurationPacketListenerImpl.java:153–176` (`handleConfigurationFinished`).
Configuration sends enabled feature information and schedules registry
synchronization and spawn preparation. Completion switches the outbound protocol
to PLAY, rechecks duplicate identity/admission, then spawns the prepared player.

**Teaching boundary:** a browser WebSocket room handshake can retain the ordered
states (hello → initial state → ready) without implementing Mojang authentication,
encryption, compression, registries, secure chat, transfer, or Minecraft's TCP
packet framing. It is an original protocol, not a compatible Minecraft client.

## 2. A joining player needs current state

**Observed:** `server/network/config/PrepareSpawnTask.java:47–78` (`start`); `server/network/config/PrepareSpawnTask.java:182–214` (`spawn`).
Spawn preparation loads saved player data, resolves a saved or generated spawn,
waits for the relevant chunks/entities, creates the ServerPlayer, loads its data,
sets its position and calls PlayerList.placeNewPlayer.

`server/players/PlayerList.java:149–225` (`placeNewPlayer`); `client/multiplayer/ClientPacketListener.java:511–583` (`handleLogin`).
The server installs the play listener, sends ClientboundLoginPacket containing
player/world/view/simulation parameters, then abilities, held slot, recipes,
permissions, player information, initial teleport and inventory/menu setup.
The client constructs its ClientLevel and local player, sets the entity ID and
begins waiting for the new level. **Login parameters are not the entire world.**

`server/network/PlayerChunkSender.java:50–74` (`sendNextChunks`); `server/network/PlayerChunkSender.java:86–112` (`collectChunksToSend`); `server/network/PlayerChunkSender.java:114–126` (`onChunkBatchReceivedByClient`); `client/multiplayer/ClientPacketListener.java:848–861` (`handleLevelChunkWithLight`).
PlayerChunkSender collects ready pending chunks in distance order, bounds sends
with a quota and unacknowledged-batch count, sends batch start, chunk-with-light
records and batch finish, and adjusts its target pace from client feedback.
ClientboundLevelChunkWithLightPacket carries x/z plus separate chunk and light
data. The client replaces chunk data and queues its light update.

**Teaching boundary:** one 16 × 32 × 16 demo volume fits in a single versioned
snapshot. The tutorial can send that snapshot and player records before marking
the browser ready. This is a deliberate replacement for the game's chunk stream,
not a claim about ClientboundLoginPacket's payload.

## 3. Actions request changes; the server checks them

**Observed:** `server/network/ServerGamePacketListenerImpl.java:1345–1403` (`handlePlayerAction`); `server/level/ServerPlayerGameMode.java:164–264` (`handleBlockBreakAction`); `server/network/ServerGamePacketListenerImpl.java:1415–1482` (`handleUseItemOn`).
ServerGamePacketListenerImpl dispatches start/change/abort/stop mining actions to
ServerPlayerGameMode and records the processed action sequence. Break handling
checks interaction range, world height, protection, game mode and progress; it
can continue delayed destruction when a STOP arrives before completion. The
inspected STOP threshold can be **0.7** computed progress, so the browser demo's
requirement of completed mining at 1.0 is a simplification.

Use-item-on handling checks that the client has loaded, the item is enabled,
reach, the supplied hit location, height, protection and interaction rules. It
sends authoritative state for the hit cell and adjacent cell after processing
that path. This is more than trusting a client-provided replacement block ID.

`server/MinecraftServer.java:1009–1019` (`processPacketsAndTick`).
The server processes queued packets before its game tick. The handler paths use
PacketUtils.ensureRunningOnSameThread before world access. This establishes a
serialization boundary; static analysis here does not measure exact wall-clock
ordering of two real network clients racing for one block.

**Teaching boundary:** validate an action against the current shared world,
check the session's pose/inventory and mining duration, apply an accepted edit
once, increment a world revision, and broadcast its result. A monotonically
increasing demo revision is our protocol design, not a recovered Minecraft field.
Inventory grants and atomic conflict outcomes must follow the demo's actual
server implementation. Minecraft's full loot/drop/pickup behavior is not ported.

## 4. Acknowledgment is separate from authoritative state

**Observed:** `server/network/ServerGamePacketListenerImpl.java:1546–1552` (`ackBlockChangesUpTo`); `server/network/ServerGamePacketListenerImpl.java:313–332` (`tick`).
The server retains the maximum nonnegative processed block-action sequence and
sends a cumulative ClientboundBlockChangedAckPacket during connection ticking.
The packet contains a sequence number, not an accepted block state or success bit.
A processed request can have failed world/gameplay validation.

`client/multiplayer/MultiPlayerGameMode.java:290–296` (`startPrediction`); `client/multiplayer/MultiPlayerGameMode.java:234–288` (`continueDestroyBlock`); `client/multiplayer/prediction/BlockStatePredictionHandler.java:18–26` (`retainKnownServerState`); `client/multiplayer/prediction/BlockStatePredictionHandler.java:39–51` (`endPredictionsUpTo`).
The client opens a prediction scope with an incrementing sequence. A completed
local break can remove the visual block before the server reply. Prediction
records retain known server state and the player's earlier position by block
address. Incoming server block updates can update this retained state while the
predicted visual remains active.

`client/multiplayer/ClientPacketListener.java:924–927` (`handleBlockUpdate`); `client/multiplayer/ClientLevel.java:211–215` (`setServerVerifiedBlockState`); `client/multiplayer/ClientLevel.java:192–198` (`handleBlockChangedAck`); `client/multiplayer/ClientLevel.java:217–226` (`syncBlockState`).
On acknowledgment the client resolves retained records up to that sequence and
synchronizes authoritative block states. If a restored state would collide with
the local player, reconciliation can also restore its saved position.

**Teaching boundary:** separate a client's confirmed world from pending edits.
Authoritative deltas/snapshots update confirmed data; an acknowledgment retires
processed pending actions, including rejected ones. Rebuild the displayed world
from confirmed state plus the remaining predictions. A latency slider in the
browser demonstrates an introduced delay; it is not measured Minecraft RTT.

## 5. Own movement and another player's movement have different paths

**Observed:** `client/player/LocalPlayer.java:292–330` (`sendPosition`); `server/network/ServerGamePacketListenerImpl.java:1086–1124` (`handleMovePlayer`); `server/network/ServerGamePacketListenerImpl.java:1126–1251` (`handlePlayerPositionChange`).
LocalPlayer chooses position+rotation, position-only, rotation-only or status-only
packets according to changes and a periodic position reminder. The server checks
finite values, load/teleport state and displacement. It resolves movement against
collision shapes, then accepts the requested pose or sends a correcting teleport.
The path has exceptions for game modes, vehicles, flight, dimensions and other
states. It is inaccurate to describe this as the server replaying only WASD input.

`server/level/ServerEntity.java:301–346` (`sendPairingData`); `server/level/ServerEntity.java:100–217` (`sendChanges`); `server/level/ServerEntity.java:219–240` (`createMovePacket`).
ServerEntity sends an entity's creation packet, tracked data, syncable attributes,
equipment and applicable relationships to a newly tracking player. Later it
chooses position/rotation delta or full position-sync packets according to update
conditions, precision and synchronization state. It uses PositionPath and an
interpolation tracker in this version; not all motion is the old simple XYZ delta.

`client/multiplayer/ClientPacketListener.java:585–607` (`handleAddEntity`); `client/multiplayer/ClientPacketListener.java:609–622` (`createEntityFromPacket`); `client/multiplayer/ClientPacketListener.java:656–681` (`handleEntityPositionSync`); `client/multiplayer/ClientPacketListener.java:730–757` (`handleMoveEntity`); `world/entity/LinearInterpolationHandler.java:39–47` (`doInterpolate`).
The client constructs RemotePlayer only after corresponding player information is
available. Non-local-authoritative entity updates use moveOrInterpolateTo where
appropriate; exceptional large/fresh updates can snap. LinearInterpolationHandler
has a default of three steps and interpolates position and rotation toward targets.
This does not establish a universal three-tick network buffering policy for every
entity or transport situation.

**Teaching boundary:** the demo can simulate local movement immediately, validate
poses on the server, and interpolate received remote-player snapshots. If the demo
instead sends input and replays it server-side, state that design difference.
Its timing/buffer length, avatar geometry, snapshot cadence and collision limits
are chosen for the reconstruction, not copied as a complete 26.3 movement port.

## 6. Leaving a session is different from forgetting a world

**Observed:** `server/network/ServerGamePacketListenerImpl.java:1533–1544` (`removePlayerFromWorld`); `server/players/PlayerList.java:299–332` (`remove`); `world/level/storage/PlayerDataStorage.java:34–62` (`save`); `world/level/storage/PlayerDataStorage.java:91–101` (`load`).
Disconnect cleanup removes the player through PlayerList, which saves that player's
data before removing it and broadcasting player-info removal. PlayerDataStorage
writes compressed NBT to a temporary file, safely replaces UUID.dat while retaining
UUID.dat_old, and on load can fall back to the old file and apply player data fixing.

`world/entity/player/Player.java:621–636` (`addAdditionalSaveData`); `world/entity/player/Player.java:599–619` (`readAdditionalSaveData`); `world/entity/Entity.java:2137–2213` (`saveWithoutId`).
The player save hierarchy includes inventory/selected slot; the entity save includes
position, motion, rotation and UUID. Loading reconstructs these records as part of
spawn preparation. Minecraft identity/authentication is not equivalent to a room's
anonymous demo reconnect token.

`server/MinecraftServer.java:613–623` (`saveEverything`); `server/MinecraftServer.java:589–611` (`saveAllChunks`).
MinecraftServer.saveEverything saves players and all level chunks/world metadata.
Chunk/world persistence is a distinct path from individual disconnect cleanup;
this analysis does **not** claim that every block action fsyncs the whole world or
that a player's disconnect is one atomic player+world disk transaction.

**Teaching boundary:** persist a room's authoritative blocks plus player records
on the server, use a session identity/reconnect token to reattach a player, and send
a fresh server snapshot after reconnecting. A small versioned JSON record with
atomic replacement is our readable persistence format, not Minecraft NBT/regions.

## Checklist and limits

| Question | Status | Evidence type / boundary |
| --- | --- | --- |
| Which shipped artifact and version? | Answered | Verified official 26.3 client JAR, class hashes and REA archive evidence. |
| Join/configuration/play progression? | Answered | Static named listener/task paths, not a live login capture. |
| Initial world and player data? | Answered within selected paths | Login parameters, player/registry setup, chunk-with-light batching; no complete registry or chunk codec reconstruction. |
| Server edit authority and acknowledgment? | Answered | Reconstructed action handlers, game mode, prediction and correction paths. |
| Remote player creation/motion? | Answered within selected paths | Entity pairing, position path choice and client interpolation; no complete entity tracking-range evaluator or all entity physics. |
| Disconnect and return? | Answered within selected paths | Player save/load and world save entry points; no crash-durability timing measurements. |
| Is the browser demo Minecraft wire-compatible? | No claim | Original WebSocket/JSON reconstruction with explicit simplifications. |
| Actual browser-server runtime behavior? | Separate validation | Must be established by implementation/integration tests, not this JAR's static evidence. |

## Reproduce

Use the pinned verified client and decompiler already obtained for Part 1:

```sh
python3 _tools/minecraft-multiplayer/reproduce-research.py \
  --jar /tmp/minecraft-deep-dive-reproduction/26.3-client.jar \
  --vineflower /tmp/minecraft-deep-dive-reproduction/vineflower-1.12.0.jar \
  --java /opt/homebrew/opt/openjdk/bin/java \
  --output /tmp/minecraft-multiplayer-fresh-reconstruction
```

The output directory must be new. The script checks both pinned SHA-256 values,
selects top-level and nested class files into a deterministic scratch JAR,
reconstructs Java, and writes member hashes and tool/command provenance. It does
not install Java, start Minecraft, accept an EULA, or distribute original game
assets/source. `source-locations.json` records the inspected reconstructed methods.
