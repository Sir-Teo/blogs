# One world, two players

Part 2 of the Minecraft article. The post is
`_posts/2026-10-26-one-world-two-players.markdown` and uses the same visual
language and original landscape as Part 1. Eight figures build from disconnected
copies to a real room, a second client, authoritative edits, prediction and
correction, competing actions, movement, and a playable invitation.

The JAR investigation is in `research.md`. It reconstructs selected multiplayer
classes from the pinned official 26.3 client JAR, including its shared/server
classes. `research-provenance.json` pins the carrier and decompiler hashes plus
97 selected class-file hashes; `source-locations.json` records the inspected
method spans. Only the decompiler ran, not Minecraft itself. Use
`reproduce-research.py --help` to reproduce that focused static investigation.
Original Java and downloaded game files remain outside the repository.

## Run the actual game

From the repository root:

```sh
bundle exec jekyll build
npm --prefix _tools/minecraft-multiplayer ci
npm --prefix _tools/minecraft-multiplayer start -- --host 0.0.0.0 --port 4174
```

Open:

```text
http://localhost:4174/blogs/2026/10/26/one-world-two-players.html
```

The same Node process serves the built article and its assets and upgrades `/ws`
to the game connection. It adds a `minecraft-multiplayer-server` meta tag to the
HTML it serves, which is how the article knows to use that `/ws`. A page served
anywhere else (Jekyll on port 4173 or 4000, GitHub Pages) uses the in-page server
below unless you pick this one: add `?server=ws://localhost:4174/ws` to the
article's address, or enter that address under **Server connection** in step 1.
The service exposes `/health`. It does not require the official Minecraft
runtime or assets.

For **two devices on the same network**, open the article using the host's LAN
address instead of localhost. Create a world in the final figure and send its
invite to the other player. The invite uses the selected server's hostname and
contains the room code, never the per-player resume token. Each person can walk,
jump, mine, place cobblestone and torches, and see the other's avatar and edits.
The on-page teaching companion disconnects when the final figure opens, and the
introduced reply delay resets to zero. A guest receives a separate identity and
inventory. Disconnecting or reloading the same tab can resume that player.

Rooms are saved in `_tools/minecraft-multiplayer/var/` by default. Save explicitly
from the game; changes also receive coalesced saves and disconnect cleanup.
Keep that data directory across server restarts. It is ignored by Git, along
with node_modules. Browser storage holds only the per-tab resume credential;
the server owns world and player records. Clearing that browser credential
creates a different player, while the room's saved world remains.

## Without a server: the in-page mode

GitHub Pages serves files only, so the published article cannot reach this
process. Instead the page loads `assets/js/minecraft-multiplayer-server.js`, the
same room logic and session protocol that `server.cjs` runs, and connects each
client to it through a loopback socket. That socket implements the part of the
WebSocket interface the client uses (`readyState`, `send`, `close`, and
open/message/close events). Every message still crosses as JSON text in its own
later task, never synchronously, through the same validation, ordered reply
delay and 20 Hz clock, so prediction, the delay slider and races behave as they
do over a network. The **Server connection** disclosure in step 1 names the mode
in use ("In-page server (this tab)" or "Cave server at …").

- Rooms are saved as the same versioned record in `localStorage`
  (`minecraft-multi:room:<CODE>`; the twelve most recently saved are kept).
  Save, disconnect, reconnect and reload resume a player as they do with the
  server. Here the browser's storage is the server's disk.
- The invitation opens the article in another tab or window of the same browser.
  The tab holding a room serves it, and other tabs relay through
  `BroadcastChannel`. A tab that closes saves first and tells its guests; the next
  tab to reconnect restores the room from storage and serves it. Browsers
  throttle timers in background tabs, so the holding tab drives its clock from a
  small worker.
- Another device cannot reach an in-page room. Opening such an invite elsewhere
  says so and points here; the earlier figures start a new world instead. To play
  across devices, run the server as above and enter its address under **Server
  connection** (or open the article with `?server=ws://HOST:4174/ws`).

## Public hosting

LAN invites are not public internet addresses. For public play, run this service
on a host reachable by both players, with HTTPS/WSS at its public domain, and
persist its data directory. No public service is deployed by this repository.
The article's **Server connection** disclosure accepts an alternate `wss://…/ws`
endpoint; invites open the article served by that same host. GitHub Pages serves
the static post but does not run this WebSocket server; there the article uses
the in-page mode above.

A Dockerfile is included. Generate `_site` before building the image from the
repository root:

```sh
bundle exec jekyll build
docker build -f _tools/minecraft-multiplayer/Dockerfile -t cave-room .
docker run --rm -p 4174:4174 -v cave-data:/data cave-room
```

Terminate TLS at the hosting platform/reverse proxy and set `PUBLIC_ORIGIN` to
its HTTPS origin when needed. CLI/environment settings include HOST, PORT,
DATA_DIR, SITE_DIR, and PUBLIC_ORIGIN. The Docker recipe is provided for hosting;
Docker is not a prerequisite for the locally verified Node server.

## Implementation and boundaries

- `assets/js/minecraft-multiplayer-server.js` (re-exported by `server-core.cjs`)
  owns room state, per-player inventory and pose, fixed50ms input simulation,
  server-side mining progress and validated edits. The server grants each
  action's inventory effects once, including an unsupported torch when its
  support is removed. Only the host can reset the reference experiment. Its hub
  owns the session protocol for both hosts: joins and resume tokens, message
  validation and rate limits, ordered artificial reply delay and room presence.
  The same file holds the in-page loopback transport, storage and tab relay.
- `server.cjs` connects that hub to real `ws` WebSocket sessions and adds atomic
  JSON persistence and HTTP/static serving. It acknowledges the exact snapshot
  written to disk, not a later live revision. Origins, message length/rate,
  players and rooms are bounded.
- `minecraft-multiplayer-core.js` owns each browser's confirmed array, pending
  predictions, processed sequences, unacknowledged input replay and remote-pose
  interpolation. Block geometry is invalidated by edits, not pose snapshots.
- `minecraft-multiplayer.js` connects WebSockets or in-page loopback sockets
  (see the in-page mode above) and builds the article's
  controls and playable views. The two on-page demo clients have separate
  identities/sockets; actual guests use a separate tab/browser/device. Resume
  credentials are stored only for the primary reader, never its demo companion.
- `minecraft-play-render.js` reuses the original procedural textures and adds
  original voxel avatars. Renderer startup is deferred until a playable view is
  visible; offscreen figures retain state without painting. No game art is used.

This is an original readable WebSocket/JSON reconstruction, not a Minecraft
wire-compatible client. In particular it uses input replay instead of Java
Edition26.3's pose-reporting movement path; sends a whole8192-cell snapshot
instead of streamed chunk/registry codecs; uses a chosen100ms remote render
buffer; requires full demo mining progress; and directly grants mined stone
rather than implementing all loot/drop/pickup rules. Player identity is anonymous
and room-specific. Minecraft authentication, secure chat, full entity physics,
chunk streaming, all block shapes, combat and crafting are outside this build.

## Verify

```sh
npm --prefix _tools/minecraft-multiplayer test
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node _tools/minecraft-multiplayer/browser-check.cjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node _tools/minecraft-multiplayer/static-check.cjs
```

Both browser checks read the built site from `_site` (set `SITE_DIR` to use
another build). `static-check.cjs` serves it as plain files, as GitHub Pages
does, and fails if the page opens any real WebSocket. It drives every figure
against the in-page server: connection, second client, committed edits,
prediction under a 600 ms reply delay and a refused early finish, a race that
awards one cobblestone, remote movement, save/disconnect/reconnect/reload, a
second tab joining through the invite, that tab taking the room over when the
first closes, and a foreign invite. `page-server.test.cjs` covers the loopback
ordering, storage and tab relay in Node.

The browser check launches its own ephemeral real server and independent browser
contexts, so it does not alter a reader's room. It verifies every progressive
experiment, a visible pending prediction that is refused and restored, exactly
one inventory award from a race, actual two-browser mining and doorway traversal,
torch placement, primary identity through companion creation and reload,
server saves/reconnects, phone touch mining/jumping, and layouts at1280/390/320px
in light and dark. Screenshots go to `/tmp/minecraft-multiplayer-qa` by default.
Server tests additionally restart the server from disk, hold a save write while
a later edit commits, reject malformed traffic, test origin admission, validate
placement/player collision, and check grounded versus airborne mining progress.
