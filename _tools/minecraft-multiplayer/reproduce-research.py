#!/usr/bin/env python3
"""Reconstruct selected multiplayer classes from the verified 26.3 client JAR.

No Minecraft game runtime is executed. Requires an existing Java runtime.
Reconstructed source stays in the caller's scratch directory.
"""
import argparse, hashlib, json, subprocess, zipfile
from pathlib import Path
EXPECTED_JAR='4508d006323f24fa02876310c192d739af56516eb259000ac50f0909a68c9a2d'
EXPECTED_VINEFLOWER='1dfcfe974395734fa467ce620661c7623d05ba83670de0529b1fbd63ff548b9d'
CLASSES='''net/minecraft/server/MinecraftServer
net/minecraft/server/network/ServerHandshakePacketListenerImpl
net/minecraft/network/protocol/handshake/ClientIntentionPacket
net/minecraft/server/network/config/PrepareSpawnTask
net/minecraft/server/network/config/JoinWorldTask
net/minecraft/world/entity/player/Player
net/minecraft/world/entity/Entity
net/minecraft/server/players/PlayerList
net/minecraft/server/level/ServerEntity
net/minecraft/server/level/ServerPlayer
net/minecraft/server/network/ServerLoginPacketListenerImpl
net/minecraft/server/network/ServerConfigurationPacketListenerImpl
net/minecraft/server/network/PlayerChunkSender
net/minecraft/server/network/CommonListenerCookie
net/minecraft/server/network/ServerGamePacketListenerImpl
net/minecraft/server/level/ServerPlayerGameMode
net/minecraft/world/level/storage/PlayerDataStorage
net/minecraft/client/player/RemotePlayer
net/minecraft/client/player/LocalPlayer
net/minecraft/client/multiplayer/ClientPacketListener
net/minecraft/client/multiplayer/ClientLevel
net/minecraft/client/multiplayer/MultiPlayerGameMode
net/minecraft/client/multiplayer/prediction/BlockStatePredictionHandler
net/minecraft/world/entity/AbstractInterpolationHandler
net/minecraft/world/entity/InterpolationHandler
net/minecraft/world/entity/LinearInterpolationHandler
net/minecraft/network/Connection
net/minecraft/network/ConnectionProtocol
net/minecraft/network/protocol/game/ClientboundEntityPositionSyncPacket
net/minecraft/network/protocol/game/ClientboundMoveEntityPacket
net/minecraft/network/protocol/game/ClientboundPlayerPositionPacket
net/minecraft/network/protocol/game/ClientboundLoginPacket
net/minecraft/network/protocol/game/ClientboundLevelChunkWithLightPacket
net/minecraft/network/protocol/game/ClientboundAddEntityPacket
net/minecraft/network/protocol/game/ClientboundBlockChangedAckPacket
net/minecraft/network/protocol/game/ClientboundBlockUpdatePacket
net/minecraft/network/protocol/game/ServerboundMovePlayerPacket
net/minecraft/network/protocol/game/ServerboundPlayerActionPacket
net/minecraft/network/protocol/game/ServerboundUseItemOnPacket
net/minecraft/network/protocol/configuration/ClientboundFinishConfigurationPacket
net/minecraft/network/protocol/configuration/ServerboundFinishConfigurationPacket
net/minecraft/network/protocol/login/ClientboundHelloPacket
net/minecraft/network/protocol/login/ServerboundHelloPacket'''.splitlines()
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--jar',type=Path,required=True);p.add_argument('--vineflower',type=Path,required=True);p.add_argument('--java',default='java');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    digest=sha(a.jar)
    if digest!=EXPECTED_JAR: raise SystemExit('JAR hash does not match pinned Minecraft 26.3 client')
    if sha(a.vineflower)!=EXPECTED_VINEFLOWER: raise SystemExit('Vineflower hash does not match pinned 1.12.0 decompiler')
    a.output.mkdir(parents=True,exist_ok=False)
    selected=a.output/'selected-multiplayer.jar';members=[]
    with zipfile.ZipFile(a.jar) as src,zipfile.ZipFile(selected,'w') as dst:
      for name in src.namelist():
       if any(name==c+'.class' or name.startswith(c+'$') and name.endswith('.class') for c in CLASSES):
        data=src.read(name);info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;dst.writestr(info,data);members.append({'path':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
    out=a.output/'decompiled';out.mkdir()
    cmd=[a.java,'-jar',str(a.vineflower),'-log=ERROR',str(selected),str(out)]
    run=subprocess.run(cmd,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    (a.output/'decompile.log').write_text(run.stdout)
    record={'version':'26.3','client_sha256':digest,'vineflower_sha256':sha(a.vineflower),'selected_sha256':sha(selected),'classes':members,'command':cmd,'exit_code':run.returncode,'execution_boundary':'Only the decompiler ran; Minecraft game code was not executed.'}
    (a.output/'provenance.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps({'exit_code':run.returncode,'class_files':len(members),'output':str(a.output)}))
    raise SystemExit(run.returncode)
if __name__=='__main__': main()
