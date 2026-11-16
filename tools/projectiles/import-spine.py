"""Stage and publish the native Spine Projectiles collection atomically.

prepare SOURCE STAGING; render the staged library's thumbnails/bounds; then
publish STAGING --project ROOT --backups EXTERNAL. No Unity code is executed.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import re
import sys
# CLI preparation must not create disposable Python caches in the project.
sys.dont_write_bytecode = True
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "characters"))
from import_units import Transaction, asset_uuid, texture_meta, encoded, digest

ROOT = Path(__file__).resolve().parents[2]
BASE = "assets/resources/projectiles/spine"
LIBRARY = BASE + "/library.json"
CATALOG = "assets/resources/projectiles/catalog.json"
EDITABLE_BAKE = {"width", "height", "previewBounds", "thumbnailTime", "thumbnailSha256"}
EXPECTED_IDS = {"fly_" + str(i) for i in range(1, 68)}


def read_json(file):
    return json.loads(file.read_text(encoding="utf-8-sig"))


def external(directory, project):
    directory = Path(directory).resolve()
    if directory.is_relative_to(Path(project).resolve()):
        raise ValueError("Staging and backups must remain outside the project")
    return directory


def staged_file(staging, relative):
    if not isinstance(relative, str) or "\\" in relative or ".." in relative.split("/") or not (relative == BASE + ".meta" or relative.startswith(BASE + "/")):
        raise ValueError("Unsafe staged projectile path")
    target = staging / relative
    if not target.resolve().is_relative_to(staging):
        raise ValueError("Staged projectile file leaves staging")
    for parent in (target, *target.parents):
        if parent == staging: break
        if parent.is_symlink(): raise ValueError("Symbolic link in staged projectile input")
    return target


def prepared_paths():
    result = {BASE + ".meta", BASE + "/thumbnails.meta", LIBRARY + ".meta"}
    for index in range(1, 7):
        relative = BASE + "/fly" + str(index)
        result.add(relative + ".meta")
        for extension in (".json", ".atlas", ".png"):
            file = relative + "/fly" + str(index) + extension
            result.update((file, file + ".meta"))
    return result


def png(raw, thumbnail=False):
    import io
    with Image.open(io.BytesIO(raw)) as image:
        image.load()
        width, height = image.size
        if image.format != "PNG" or not width or not height:
            raise ValueError("Invalid PNG")
        if thumbnail and (max(width, height) > 128 or image.convert("RGBA").getchannel("A").getextrema()[1] == 0):
            raise ValueError("Projectile thumbnails must be visible PNGs up to 128 pixels")
    return width, height


def folder_meta(relative):
    return dict(ver="1.1.3", uuid=asset_uuid(relative), importer="folder", isBundle=False,
                bundleName="", priority=1, compressionType={}, optimizeHotUpdate={},
                inlineSpriteFrames={}, isRemoteBundle={}, subMetas={})


def prepare(source, staging, project=ROOT, transform=None, bounds=None):
    """Write a complete external input for the real-Spine thumbnail baker."""
    source, staging = Path(source).resolve(), external(staging, project)
    if (staging / "stage.json").exists():
        raise ValueError("Use a fresh staging directory; existing prepared inputs are preserved")
    if transform is None:
        from spine_flight_loops import prepare_skeleton
        transform = prepare_skeleton
    manifest = read_json(source / "source-manifest.json")
    ready = manifest.get("ready_clips", [])
    if len(ready) != 67 or {row.get("animation") for row in ready} != EXPECTED_IDS:
        raise ValueError("Expected the complete 67 visible Spine projectile variants")
    ready_by_skeleton = {}
    for row in ready:
        skeleton = row.get("skeleton")
        if skeleton not in {"fly" + str(i) for i in range(1, 7)}:
            raise ValueError("Unknown projectile skeleton")
        ready_by_skeleton.setdefault(skeleton, set()).add(row["animation"])
    report = read_json(Path(bounds)) if bounds else None
    if report:
        if report.get("ok") is not True or report.get("errors") or len(report.get("entries", [])) != 67:
            raise ValueError("Expected a complete successful 67-variant measurement")
        measured = {row.get("id"): row for row in report["entries"]}
        if set(measured) != {"spine-projectile:" + ident for ident in EXPECTED_IDS}:
            raise ValueError("Missing or duplicate measured projectile")
    files, assets, originals, centers = {}, [], {}, {}
    folders = [BASE, BASE + "/thumbnails"]
    for index in range(1, 7):
        ident = "fly" + str(index)
        directory = source / "Effects" / ident
        raw_json = (directory / (ident + ".json")).read_bytes()
        original = json.loads(raw_json.decode("utf-8-sig"))
        if not original.get("skeleton", {}).get("spine", "").startswith("3.8."):
            raise ValueError("Only verified Spine 3.8 data is supported")
        derived, clips = transform(copy.deepcopy(original), ident)
        if any(derived.get("animations", {}).get(name) != animation for name, animation in original["animations"].items()):
            raise ValueError("Loop conversion changed an original animation")
        if len(clips) != len(ready_by_skeleton.get(ident, set())) or {clip["sourceAnimation"] for clip in clips} != ready_by_skeleton.get(ident, set()):
            raise ValueError("Loop conversion omitted or duplicated a visible variant")
        relative = BASE + "/" + ident
        folders.append(relative)
        jsonfile, atlasfile, imagefile = (relative + "/" + ident + extension for extension in (".json", ".atlas", ".png"))
        raw_image = (directory / (ident + ".png")).read_bytes()
        width, height = png(raw_image)
        atlas = (directory / (ident + ".atlas.txt")).read_bytes()
        headers = [line.strip() for line in atlas.decode("utf-8-sig").splitlines() if line.strip().endswith(".png")]
        if headers != [ident + ".png"]:
            raise ValueError("Unexpected or external atlas page")
        if report:
            if report.get("runtimeJsonSha256", {}).get(jsonfile) != digest(encoded(derived)):
                raise ValueError("Loop measurement was made from different runtime data: " + ident)
            from spine_flight_loops import center_skeleton
            native = {}
            for clip in clips:
                row = measured["spine-projectile:" + clip["sourceAnimation"]]
                box = row.get("nativeBounds", {})
                if row.get("animation") != clip["animation"] or row.get("resource") != jsonfile[len("assets/resources/"):-5]:
                    raise ValueError("Measured loop identity changed")
                if any(type(box.get(key)) not in (int, float) or not math.isfinite(box[key]) for key in ("x", "y", "width", "height")) or box["width"] <= 0 or box["height"] <= 0:
                    raise ValueError("Invalid full-loop native bounds")
                if row.get("duration") is not None and abs(row["duration"] - clip["duration"]) > 1e-9:
                    raise ValueError("Measured loop duration changed")
                native[clip["animation"]] = box
                centers[clip["sourceAnimation"]] = dict(box)
            derived = center_skeleton(derived, clips, native)
        files[jsonfile], files[atlasfile], files[imagefile] = encoded(derived), atlas, raw_image
        files[jsonfile + ".meta"] = encoded(dict(ver="1.2.5", uuid=asset_uuid(jsonfile), importer="spine", textures=[asset_uuid(imagefile)], scale=1, subMetas={}))
        files[atlasfile + ".meta"] = encoded(dict(ver="1.0.3", uuid=asset_uuid(atlasfile), importer="asset", subMetas={}))
        files[imagefile + ".meta"] = encoded(texture_meta(imagefile, width, height))
        originals[ident] = dict(json=digest(raw_json), atlas=digest(atlas), image=digest(raw_image))
        for clip in clips:
            source_animation = clip["sourceAnimation"]
            number = int(source_animation.split("_")[1])
            if clip["animation"] not in derived["animations"] or type(clip.get("duration")) not in (int, float) or not math.isfinite(clip["duration"]) or clip["duration"] <= 0:
                raise ValueError("Loop has no finite animation duration")
            assets.append(dict(id="spine-projectile:" + source_animation, name="Spine Projectile " + str(number).zfill(2),
                category="Spine Projectiles", role="flight", kind="spine", uuid=asset_uuid(jsonfile),
                bundle="resources", resource=jsonfile[len("assets/resources/"):-5], image=imagefile,
                animation=clip["animation"], sourceAnimation=source_animation, skin="default", duration=clip["duration"],
                rotation=0, size=56, width=1, height=1, premultipliedAlpha=False,
                thumbnail=BASE + "/thumbnails/" + source_animation + ".png", loop=copy.deepcopy(clip)))
    assets.sort(key=lambda row: int(row["sourceAnimation"].split("_")[1]))
    for relative in folders:
        files[relative + ".meta"] = encoded(folder_meta(relative))
    files[LIBRARY + ".meta"] = encoded(dict(ver="1.0.2", uuid=asset_uuid(LIBRARY), importer="json", subMetas={}))
    source_info = dict(name="Spine Projectiles 1", spineVersion="3.8.99", alpha="straight", skeletons=originals,
                       sourceManifestSha256=digest((source / "source-manifest.json").read_bytes()),
                       conversion="Original Spine artwork and source animations retained; additional stationary cyclic flight animations.")
    library = dict(version=1, source=source_info, assets=assets)
    if report:
        # Verify the complete uncentered library contract, not only geometry.
        if report.get("preparedLibrarySha256") != digest(encoded(library)):
            raise ValueError("Loop measurement library metadata changed")
        library["source"]["centering"] = dict(method="full-loop native rendered envelope", samplesPerSecond=120,
            boundsSha256=digest(encoded({key: centers[key] for key in sorted(centers)})))
    files[LIBRARY] = encoded(library)
    for relative, raw in files.items():
        target = staging / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
    protected = dict(version=1, source=source_info, assets=assets,
                     files={relative: digest(raw) for relative, raw in files.items() if relative != LIBRARY})
    (staging / "stage.json").write_bytes(encoded(protected))
    return dict(staging=str(staging), library=str(staging / LIBRARY), assets=len(assets), skeletons=6)


def members(text, start=0):
    """Locate object value spans without reserializing any unrelated bytes."""
    decoder = json.JSONDecoder()
    def ws(at):
        while at < len(text) and text[at] in " \t\r\n\ufeff":
            at += 1
        return at
    at = ws(start)
    if text[at] != "{":
        raise ValueError("Expected a JSON object")
    result = {}
    at = ws(at + 1)
    while text[at] != "}":
        key, at = decoder.raw_decode(text, at)
        at = ws(at)
        if text[at] != ":":
            raise ValueError("Invalid JSON member")
        begin = ws(at + 1)
        value, end = decoder.raw_decode(text, begin)
        result[key] = (begin, end, value)
        at = ws(end)
        if text[at] == ",":
            at = ws(at + 1)
        elif text[at] != "}":
            raise ValueError("Invalid JSON object")
    return result


def append_array(text, key, rows):
    begin, end, existing = members(text)[key]
    if not isinstance(existing, list):
        raise ValueError("Projectile catalog " + key + " must be an array")
    decoder, at, last = json.JSONDecoder(), begin + 1, None
    while at < end:
        while text[at].isspace() or text[at] == ",": at += 1
        if text[at] == "]": break
        _, last = decoder.raw_decode(text, at)
        at = last
    rendered = ",\n".join("\n".join("    " + line for line in json.dumps(row, ensure_ascii=False, indent=2, allow_nan=False).splitlines()) for row in rows)
    if not rows: return text
    if last is None:
        return text[:begin + 1] + "\n" + rendered + "\n  " + text[begin + 1:]
    return text[:last] + ",\n" + rendered + text[last:]


def append_catalog(raw, assets, provenance):
    text = raw.decode("utf-8")
    data = json.loads(text.lstrip("\ufeff"))
    existing = {asset["id"]: asset for asset in data["assets"]}
    new_assets = []
    for asset in assets:
        old = existing.get(asset["id"])
        if old is None:
            new_assets.append(asset)
        elif any(old.get(key) != value for key, value in asset.items()):
            raise ValueError("Imported catalog asset was edited or needs an explicit migration: " + asset["id"])
    expected_sets = [dict(id=row["id"], name=row["name"], category=row["category"], flight=row["id"]) for row in assets]
    existing_sets = {row["id"]: row for row in data["sets"]}
    new_sets = []
    for row in expected_sets:
        if row["id"] not in existing_sets: new_sets.append(row)
        elif any(existing_sets[row["id"]].get(key) != value for key, value in row.items()):
            raise ValueError("Imported projectile set was edited: " + row["id"])
    text = append_array(text, "assets", new_assets)
    text = append_array(text, "sets", new_sets)
    begin, end, source = members(text)["source"]
    if not isinstance(source, dict): raise ValueError("Projectile catalog source must be an object")
    nested = members(text, begin)
    if "spineProjectiles" in nested:
        if not isinstance(nested["spineProjectiles"][2], dict) or any(nested["spineProjectiles"][2].get(key) != value for key, value in provenance.items()):
            raise ValueError("Spine projectile provenance changed; review a deliberate reimport")
    else:
        insert = max((row[1] for row in nested.values()), default=begin + 1)
        value = json.dumps(provenance, ensure_ascii=False, indent=2, allow_nan=False)
        value = value.replace("\n", "\n    ")
        addition = ("," if nested else "") + "\n    \"spineProjectiles\": " + value
        text = text[:insert] + addition + text[insert:]
    result = json.loads(text.lstrip("\ufeff"))
    if any(result[key] != value for key, value in data.items() if key not in ("assets", "sets", "source")):
        raise ValueError("Unrelated projectile data changed")
    return text.encode("utf-8")


def publish(staging, project=ROOT, backups=None, dry_run=False):
    staging = external(staging, project)
    backups = external(backups or staging / "backups", project)
    prepared, library = read_json(staging / "stage.json"), read_json(staging / LIBRARY)
    assets = library.get("assets", [])
    if set(prepared.get("files", {})) != prepared_paths():
        raise ValueError("Prepared runtime file list changed")
    if library.get("version") != 1 or library.get("source") != prepared["source"] or len(assets) != 67:
        raise ValueError("Staged library contract changed")
    expected = {row["id"]: row for row in prepared["assets"]}
    if len({row.get("id") for row in assets}) != 67 or {row.get("id") for row in assets} != set(expected):
        raise ValueError("Missing or duplicate staged projectile")
    for asset in assets:
        original = expected[asset["id"]]
        if {k: v for k, v in asset.items() if k not in EDITABLE_BAKE} != {k: v for k, v in original.items() if k not in EDITABLE_BAKE}:
            raise ValueError("Protected projectile fields changed: " + asset["id"])
        bounds = asset.get("previewBounds", {})
        if any(type(bounds.get(key)) not in (int, float) or not math.isfinite(bounds[key]) for key in ("minX", "minY", "maxX", "maxY", "width", "height")):
            raise ValueError("Missing real-Spine loop bounds: " + asset["id"])
        if bounds["width"] <= 0 or bounds["height"] <= 0 or abs(bounds["maxX"] - bounds["minX"] - bounds["width"]) > 1e-4 or abs(bounds["maxY"] - bounds["minY"] - bounds["height"]) > 1e-4:
            raise ValueError("Invalid real-Spine loop bounds")
        if any(type(asset.get(key)) not in (int, float) or not math.isfinite(asset[key]) or asset[key] <= 0 for key in ("width", "height")):
            raise ValueError("Invalid projectile display size")
        if type(asset.get("thumbnailTime")) not in (int, float) or not 0 <= asset["thumbnailTime"] < asset["duration"]:
            raise ValueError("Thumbnail sample leaves the loop")
        raw = staged_file(staging, asset["thumbnail"]).read_bytes()
        png(raw, True)
        if digest(raw) != asset.get("thumbnailSha256"):
            raise ValueError("Thumbnail hash mismatch: " + asset["id"])
    for relative, checksum in prepared["files"].items():
        if digest(staged_file(staging, relative).read_bytes()) != checksum:
            raise ValueError("Prepared runtime input changed: " + relative)
    tx = Transaction(Path(project), backups)
    previous_raw = tx.read(LIBRARY)
    previous = json.loads(previous_raw.decode("utf-8-sig")) if previous_raw else {}
    if previous:
        old_assets = {row["id"]: row for row in previous.get("assets", [])}
        if set(old_assets) != {row["id"] for row in assets}:
            raise ValueError("Imported library variants changed; review a deliberate migration")
        for asset in assets:
            if any(old_assets[asset["id"]].get(key) != value for key, value in asset.items()):
                raise ValueError("Imported library asset was edited: " + asset["id"])
        assets = [dict(old_assets[row["id"]], **row) for row in assets]
    tx.managed.update(previous.get("importedFiles", {}))
    runtime = dict(prepared["files"])
    for asset in assets:
        file = asset["thumbnail"]
        raw = staged_file(staging, file).read_bytes()
        width, height = png(raw, True)
        runtime[file] = digest(raw)
        meta_file = file + ".meta"
        staged_file(staging, meta_file).write_bytes(encoded(texture_meta(file, width, height)))
        runtime[meta_file] = digest(staged_file(staging, meta_file).read_bytes())
    for relative in runtime:
        raw = staged_file(staging, relative).read_bytes()
        before = tx.read(relative)
        if before is not None and relative not in tx.managed and before != raw:
            raise ValueError("Unmanaged destination already exists: " + relative)
        tx.stage(relative, raw)
    published = dict(previous, **library); published.update(source=dict(previous.get("source", {}), **library["source"]), assets=assets, importedFiles=runtime)
    tx.stage(LIBRARY, encoded(published))
    before_catalog = tx.read(CATALOG)
    if before_catalog is None: raise ValueError("Missing projectile catalog")
    tx.stage(CATALOG, append_catalog(before_catalog, assets, library["source"]))
    changes = {name: dict(before=digest(before), after=digest(after)) for name, (before, after) in tx.plan.items()}
    if dry_run:
        return dict(dryRun=True, files=changes, assets=67)
    return dict(backup=tx.commit(), files=changes, assets=67)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    first = commands.add_parser("prepare")
    first.add_argument("source", type=Path); first.add_argument("staging", type=Path)
    first.add_argument("--project", type=Path, default=ROOT)
    first.add_argument("--bounds", type=Path, help="Successful first-pass real-Spine measurement report")
    second = commands.add_parser("publish")
    second.add_argument("staging", type=Path); second.add_argument("--project", type=Path, default=ROOT)
    second.add_argument("--backups", type=Path); second.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    result = prepare(args.source, args.staging, args.project, bounds=args.bounds) if args.command == "prepare" else publish(args.staging, args.project, args.backups, args.dry_run)
    print(json.dumps(result, indent=2))

if __name__ == "__main__": main()
