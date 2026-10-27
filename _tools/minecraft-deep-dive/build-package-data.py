#!/usr/bin/env python3
"""Export directory aggregates, not game contents, for the package figure."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile


def node(name, path):
    return dict(name=name, path=path, bytes=0, files=0, classes=0, children={})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[2] / "assets/data/minecraft/package.json")
    args = parser.parse_args()
    data = args.archive.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    expected = "4508d006323f24fa02876310c192d739af56516eb259000ac50f0909a68c9a2d"
    if digest != expected:
        raise ValueError("Expected the article's verified 26.3 client artifact")
    root = node("client.jar", "")
    with zipfile.ZipFile(args.archive) as jar:
        entries = jar.infolist()
        for entry in entries:
            if entry.is_dir():
                continue
            folders = entry.filename.split("/")[:-1]
            # Aggregate deep paths; retain folders, sizes and counts only.
            if len(folders) < 6:
                folders.append("(files)")
            else:
                folders = folders[:6]
            current = root
            for i in range(len(folders) + 1):
                current["bytes"] += entry.file_size
                current["files"] += 1
                current["classes"] += int(entry.filename.endswith(".class"))
                if i < len(folders):
                    name = folders[i]
                    if name not in current["children"]:
                        current["children"][name] = node(name, "/".join(folders[:i + 1]))
                    current = current["children"][name]

    def finish(n):
        n["children"] = sorted((finish(c) for c in n["children"].values()), key=lambda c: (-c["bytes"], c["name"]))
        return n

    output = dict(version="26.3", artifactSha256=digest, archiveBytes=len(data), archiveEntries=len(entries),
                  directoryEntries=sum(e.is_dir() for e in entries), tree=finish(root),
                  method="Exact uncompressed byte sizes and file counts from ZIP directory; folders aggregated to depth six. No game contents.")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, separators=(",", ":")) + "\n")
    print(f"Wrote {args.output}: {root['files']:,} files, {root['classes']:,} class files")


if __name__ == "__main__":
    main()
