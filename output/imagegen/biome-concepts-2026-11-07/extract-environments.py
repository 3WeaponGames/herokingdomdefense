"""Read Unity packages without running Unity or changing runtime game assets."""
import collections
import hashlib
import gzip
import io
import json
import pathlib
import re
import tarfile

SOURCE = pathlib.Path(r"C:\Users\danny\Documents\projects\Hero Line Wars\Unity-Assets\Maps")
DESTINATION = SOURCE / "Extracted" / "2D-Minimal-Environments-2026-11-07"
OUTPUT = pathlib.Path(__file__).resolve().parent


def save_new(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise RuntimeError(f"Existing file differs; refusing to overwrite: {path}")
        return
    with path.open("xb") as stream:
        stream.write(data)


def main():
    records, packages = [], []
    for number, package in enumerate(sorted(SOURCE.glob("2D Minimal - Environment*.unitypackage")), 1):
        pack = f"environment-{number}"
        with tarfile.open(fileobj=io.BytesIO(gzip.decompress(package.read_bytes())), mode="r:") as archive:
            members = {member.name: archive.extractfile(member).read() for member in archive if member.isfile()}
            count = 0
            for name, member in members.items():
                if not name.endswith("/pathname"):
                    continue
                # These packages append newline + '00' to Unity's pathname files.
                pathname = member.decode("utf-8-sig").splitlines()[0].rstrip("\x00")
                relative = pathlib.PurePosixPath(pathname)
                if relative.is_absolute() or ".." in relative.parts or relative.parts[0] != "Assets":
                    raise ValueError(f"Unsafe archive pathname: {pathname!r}")
                guid = name.split("/")[0]
                asset = members.get(guid + "/asset")
                if asset is None:
                    continue
                data = asset
                target = DESTINATION / pack / pathlib.Path(*relative.parts)
                save_new(target, data)
                meta = members.get(guid + "/asset.meta")
                if meta:
                    save_new(pathlib.Path(str(target) + ".meta"), meta)
                record = {"pack": pack, "guid": guid, "unityPath": pathname,
                          "file": str(target), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                if relative.suffix.lower() == ".png":
                    from PIL import Image
                    with Image.open(target) as image:
                        record.update(width=image.width, height=image.height, mode=image.mode)
                records.append(record)
                count += 1
        packages.append({"file": str(package), "sha256": hashlib.sha256(package.read_bytes()).hexdigest(), "assets": count})
    # Resolve each demo scene's referenced prefabs/sprites rather than guessing colors.
    biomes = []
    for name in ["Forest", "DeepForest", "Autumn", "Desert", "Snow", "Ice", "Fire", "Lava"]:
        scene = next(record for record in records if record["unityPath"].endswith(f"/DemoScene_{name}.unity"))
        by_guid = {record["guid"]: record for record in records if record["pack"] == scene["pack"]}
        visited, pending = set(), [scene["guid"]]
        while pending:
            guid = pending.pop()
            if guid in visited or guid not in by_guid:
                continue
            visited.add(guid)
            record = by_guid[guid]
            if pathlib.Path(record["file"]).suffix.lower() in [".unity", ".prefab", ".mat"]:
                pending.extend(re.findall(r"guid:\s*([0-9a-f]{32})", pathlib.Path(record["file"]).read_text(encoding="utf-8-sig")))
        sprites = sorted([by_guid[guid] for guid in visited if by_guid[guid]["unityPath"].endswith(".png") and "/Sprites/" in by_guid[guid]["unityPath"]], key=lambda x: x["unityPath"])
        biomes.append({"id": re.sub(r"(?<!^)(?=[A-Z])", "-", name).lower(), "name": name, "pack": scene["pack"], "scene": scene["file"], "sprites": [record["guid"] for record in sprites]})
    manifest = {"sourceDirectory": str(SOURCE), "extractedDirectory": str(DESTINATION), "packages": packages, "assets": records, "biomes": biomes}
    save_new(OUTPUT / "source-manifest.json", (json.dumps(manifest, indent=2) + "\n").encode())
    print(json.dumps({"extractedDirectory": str(DESTINATION), "assets": len(records), "pngs": sum(r["unityPath"].endswith(".png") for r in records), "biomes": [{"name": b["name"], "sprites": len(b["sprites"])} for b in biomes]}, indent=2))


if __name__ == "__main__":
    main()
