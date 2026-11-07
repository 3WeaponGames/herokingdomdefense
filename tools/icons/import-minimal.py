"""Import only the original 128px Layer Lab Minimal icons as Creator sprites.

Usage: python tools/icons/import-minimal.py <unitypackage> [--pack hero-equipment] [--dry-run]
Requires Pillow and PyYAML, as do the other licensed Unity asset importers.
The authoring catalog lives with this importer; the icons folder contains only
PNG sprites and Creator metadata. No Unity scripts or demo scenes are imported.
"""
import argparse
from collections import Counter
import io
import json
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "characters"))
from import_units import Transaction, digest, texture_meta
from unity_monsters import asset_meta, unpack
from PIL import Image


PACKS = {
    "minimal": dict(prefix="Assets/Layer Lab/2D Minimal-IconPack/Icons/128/",
                    destination="assets/resources/icons/2d-minimal",
                    catalog="tools/icons/minimal-pack.catalog.json", count=900,
                    title="2D Minimal - Icon Pack", version="1.0.1"),
    "hero-equipment": dict(prefix="Assets/Layer Lab/2D Minimal-HeroEquipIcons/Icons/128/",
                           destination="assets/resources/icons/2d-minimal-hero-equipment",
                           catalog="tools/icons/hero-equipment.catalog.json", count=60,
                           title="2D Minimal - Hero Equip Icons", version="1.0"),
}
CATEGORIES = {
    "Building": "Buildings", "Consumable": "Consumables", "Economy": "Economy",
    "Gear": "Equipment", "Item": "Items", "Material": "Materials",
    "Misc": "Misc", "Neture": "Nature", "Prop": "Props", "Stat": "Stats",
}


def category(name, pack="minimal"):
    tokens = name.split("_")
    if pack == "hero-equipment":
        groups = {"Armor": "Armor", "Weapon": "Weapons", "Item": "Items"}
        if tokens[0] not in groups:
            raise ValueError("Unrecognized equipment icon category: " + name)
        return groups[tokens[0]]
    if tokens[0] == "UI" and len(tokens) > 2:
        return "UI/" + ("Misc" if tokens[1] == "ETC" else tokens[1])
    if tokens[0] not in CATEGORIES:
        raise ValueError("Unrecognized icon category: " + name)
    return CATEGORIES[tokens[0]]


def import_pack(project, package, artifacts, dry_run=False, pack="minimal"):
    spec = PACKS[pack]
    prefix, destination, catalog_file = spec["prefix"], spec["destination"], spec["catalog"]
    tx = Transaction(project, artifacts)
    previous = tx.read(catalog_file)
    catalog = json.loads(previous.decode("utf-8-sig")) if previous else {}
    old_icons = {row["path"]: row for row in catalog.get("icons", [])}
    tx.managed = {key: row["sha256"] for key, row in old_icons.items()}
    icons, destinations = [], set()
    for source, item in sorted(unpack(package).items()):
        if not source.startswith(prefix) or not source.lower().endswith(".png"):
            continue
        filename = source[len(prefix):]
        if not re.fullmatch(r"[A-Za-z0-9_-]+\.png", filename):
            raise ValueError("Unexpected icon filename: " + source)
        name = filename[:-4]
        group = category(name, pack)
        relative = destination + "/" + group + "/" + filename
        if relative.lower() in destinations:
            raise ValueError("Duplicate icon destination: " + relative)
        destinations.add(relative.lower())
        with Image.open(io.BytesIO(item["asset"])) as image:
            if image.format != "PNG" or image.size != (128, 128):
                raise ValueError("Expected a native 128px PNG: " + source)
            image.verify()
        unity = asset_meta(item).get("TextureImporter", {})
        if unity.get("spriteMode") != 1 or unity.get("spriteSheet", {}).get("sprites"):
            raise ValueError("Expected one icon per image: " + source)
        current = tx.read(relative)
        if current is not None and relative not in old_icons and current != item["asset"]:
            raise ValueError("An existing untracked icon would be overwritten: " + relative)
        # Preserve the exact licensed source bytes, names and transparent canvas.
        tx.stage(relative, item["asset"])
        tx.json(relative + ".meta", texture_meta(relative, 128, 128), True)
        row = dict(old_icons.get(relative, {}))
        row.update(name=name, category=group, path=relative,
                   reference="@icon/" + relative[len("assets/resources/"):-4],
                   sha256=digest(item["asset"]), unityGuid=item["guid"])
        icons.append(row)
    if len(icons) != spec["count"]:
        raise ValueError(f"Expected {spec['count']} original 128px icons; found {len(icons)}")
    folders = {"assets/resources/icons", destination}
    for row in icons:
        parent = Path(row["path"]).parent
        while str(parent).replace("\\", "/").startswith(destination):
            folders.add(str(parent).replace("\\", "/"))
            parent = parent.parent
    for folder in sorted(folders):
        tx.folder(folder)
    result = dict(catalog)
    result.update(version=1, pack=spec["title"], resolution=128,
                  source=dict(package=package.name, version=spec["version"], publisher="Layer Lab",
                              sha256=digest(package.read_bytes())),
                  categories=dict(sorted(Counter(row["category"] for row in icons).items())),
                  icons=icons)
    tx.json(catalog_file, result)
    # Give the editor the stable UUIDs before its watcher sees the new textures.
    folder_metas = {folder + ".meta" for folder in folders}
    def order(row):
        relative = row[0]
        return (0 if relative in folder_metas else 1 if relative.endswith(".meta")
                else 2 if relative.endswith(".png") else 3, relative)
    tx.plan = dict(sorted(tx.plan.items(), key=order))
    summary = dict(icons=len(icons), resolution=128, categories=result["categories"],
                   changedFiles=len(tx.plan), dryRun=dry_run)
    if not dry_run:
        summary["backup"] = tx.commit()
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("--pack", choices=sorted(PACKS), default="minimal")
    parser.add_argument("--project", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--artifacts", type=Path,
                        default=Path.home() / "Documents/Codex Artifacts/HeroKingdomDefense/2026-11-07-icons")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    print(json.dumps(import_pack(args.project, args.package, args.artifacts, args.dry_run, args.pack), indent=2))
