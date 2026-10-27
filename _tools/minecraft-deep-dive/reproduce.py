#!/usr/bin/env python3
"""Fetch and verify official Minecraft artifacts; optionally decompile locally.

No game code is executed. Downloaded/reconstructed game files stay in the chosen
scratch directory. Python standard library only; --decompile needs existing Java.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import urllib.request
import zipfile

MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
PINNED = {
    "client": "e877b6a07acd633fb3bb475002175cec036e7b87",
    "server": "33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c",
}
VINEFLOWER_VERSION = "1.12.0"
VINEFLOWER_SHA256 = "1dfcfe974395734fa467ce620661c7623d05ba83670de0529b1fbd63ff548b9d"
CLASS_NAMES = set("""
MinecraftServer ServerLevel ServerTickRateManager TickRateManager Level LevelChunk
LevelChunkSection PalettedContainer PalettedContainerFactory SimpleBitStorage
ZeroBitStorage SingleValuePalette LinearPalette HashMapPalette GlobalPalette
Strategy Configuration SectionPos BlockPos ChunkPos RegionFile RegionFileVersion
ChunkStatus ChunkPyramid ChunkStep ChunkStatusTasks ChunkGenerationTask StaticCache2D
NoiseBasedChunkGenerator NoiseChunk NoiseRouter NoiseRouterData DensityFunction
DensityFunctions RandomState Aquifer Climate MultiNoiseBiomeSource NormalNoise
PerlinNoise ImprovedNoise XoroshiroRandomSource SectionCompiler SectionRenderDispatcher
VisGraph VisibilitySet ModelBlockRenderer BlockModelLighter BlockStateModelDispatcher
BlockStateModel BlockStateModelPart LevelRenderer BlockLightEngine SkyLightEngine
LightEngine LevelLightEngine DataLayer RedstoneWireBlock RedstoneWireEvaluator
DefaultRedstoneWireEvaluator RepeaterBlock DiodeBlock LevelTicks LevelChunkTicks ScheduledTick TickPriority
ServerPlayerGameMode MultiPlayerGameMode ServerGamePacketListenerImpl ClientPacketListener
ClientLevel ClientboundBlockUpdatePacket ClientboundSectionBlocksUpdatePacket
ServerboundPlayerActionPacket ClientboundBlockChangedAckPacket BlockStatePredictionHandler
Entity LivingEntity CollisionGetter BlockGetter ClipContext Shapes VoxelShape AABB
DistanceManager ChunkMap ChunkSource ServerChunkCache TicketType FluidState FlowingFluid
Direction LevelHeightAccessor
BlockBehaviour Player Blocks ToolMaterial Tool Items Item
""".split())


def fetch(url, destination, expected=None, algorithm="sha1"):
    if not destination.exists():
        with urllib.request.urlopen(url, timeout=90) as response:
            data = response.read()
        if expected and hashlib.new(algorithm, data).hexdigest() != expected:
            raise ValueError(f"Hash mismatch: {url}")
        destination.write_bytes(data)
    data = destination.read_bytes()
    if expected and hashlib.new(algorithm, data).hexdigest() != expected:
        raise ValueError(f"Hash mismatch for cached {destination}")
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("/tmp/minecraft-deep-dive-reproduction"))
    parser.add_argument("--version", default="26.3", help="Pinned article version; use latest to resolve today's stable release")
    parser.add_argument("--decompile", action="store_true")
    parser.add_argument("--java", default=os.environ.get("MINECRAFT_RESEARCH_JAVA") or shutil.which("java"))
    args = parser.parse_args()
    root = args.output.expanduser().resolve()
    repo = Path(__file__).resolve().parents[2]
    if root == repo or repo in root.parents:
        parser.error("Choose a scratch directory outside the repository for game artifacts")
    root.mkdir(parents=True, exist_ok=True)
    # Resolve the live manifest each invocation; version JSON and artifacts are immutable.
    with urllib.request.urlopen(MANIFEST, timeout=90) as response:
        manifest_data = response.read()
    (root / "version_manifest_v2.json").write_bytes(manifest_data)
    manifest = json.loads(manifest_data)
    version = manifest["latest"]["release"] if args.version == "latest" else args.version
    entry = next(v for v in manifest["versions"] if v["id"] == version)
    version_data = fetch(entry["url"], root / f"{version}.json", entry["sha1"])
    metadata = json.loads(version_data)
    artifacts = {}
    for kind in ("client", "server"):
        download = metadata["downloads"][kind]
        if version == "26.3" and download["sha1"] != PINNED[kind]:
            raise ValueError(f"Pinned {kind} identity changed")
        path = root / f"{version}-{kind}.jar"
        data = fetch(download["url"], path, download["sha1"])
        if len(data) != download["size"]:
            raise ValueError(f"Size mismatch: {kind}")
        artifacts[kind] = dict(download, sha256=hashlib.sha256(data).hexdigest())
        print(f"Verified {version} {kind}: {len(data):,} bytes")

    selected = []
    resources = {}
    with zipfile.ZipFile(root / f"{version}-client.jar") as source:
        for name in source.namelist():
            if name.endswith(".class") and (
                name.rsplit("/", 1)[-1].split("$")[0].removesuffix(".class") in CLASS_NAMES
                or name.startswith("net/minecraft/world/level/levelgen/densityfunction/")
            ):
                selected.append(name)
            if not name.endswith("/") and (
                name.startswith("data/minecraft/worldgen/density_function/overworld/")
                or name in ("data/minecraft/dimension_type/overworld.json", "data/minecraft/worldgen/noise_settings/overworld.json",
                            "data/minecraft/tags/block/mineable/pickaxe.json",
                            "data/minecraft/tags/block/incorrect_for_iron_tool.json",
                            "data/minecraft/tags/block/needs_diamond_tool.json",
                            "data/minecraft/loot_table/blocks/stone.json")
            ):
                data = source.read(name)
                resources[name] = hashlib.sha256(data).hexdigest()
                destination = root / "resources" / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(data)
        with zipfile.ZipFile(root / "selected.jar", "w") as target:
            for name in selected:
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                target.writestr(info, source.read(name))
    (root / "selected-classes.txt").write_text("\n".join(selected) + "\n")
    output = dict(version=version, releaseTime=metadata["releaseTime"], manifest=MANIFEST,
                  versionUrl=entry["url"], artifacts=artifacts,
                  selectedClassFiles=selected, resourceSha256=resources,
                  coverage="Static analysis only. Selection is not whole-game source recovery.")
    (root / "provenance.json").write_text(json.dumps(output, indent=2) + "\n")
    print(f"Selected {len(selected)} class files; extracted {len(resources)} resources")
    if args.decompile:
        if not args.java:
            parser.error("--decompile requires an existing Java runtime; supply --java PATH")
        tool = root / f"vineflower-{VINEFLOWER_VERSION}.jar"
        fetch(f"https://repo.maven.apache.org/maven2/org/vineflower/vineflower/{VINEFLOWER_VERSION}/{tool.name}",
              tool, VINEFLOWER_SHA256, "sha256")
        destination = root / "decompiled"
        if destination.exists():
            parser.error("Decompiled output already exists; choose a new scratch directory")
        command = [args.java, "-Xmx4G", "-jar", str(tool), "--folder", "--thread-count=4",
                   "--log-level=WARN", f"-e={root / (version + '-client.jar')}", str(root / "selected.jar"), str(destination)]
        with (root / "decompile.log").open("w") as log:
            subprocess.run(command, check=True, stdout=log, stderr=subprocess.STDOUT)
        print(f"Reconstructed Java saved to {destination}; inspect decompile.log for warnings")
    print(f"Reproduction metadata: {root / 'provenance.json'}")


if __name__ == "__main__":
    main()
