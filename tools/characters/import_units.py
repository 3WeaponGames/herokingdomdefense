"""Import Character Maker and Minimal Monster Unity packs into Creator 2.4.

Usage: python tools/characters/import_units.py <unitypackage> --kind monster1
Existing packs: python tools/characters/import_units.py --repack-atlases [--dry-run]
Dependencies: Pillow, PyYAML. Originals and transaction logs stay outside the repo.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import copy
import struct
import errno
import shutil
import time
import uuid


NAMESPACE = uuid.UUID("21a5b5ed-f6ab-45ec-88a6-bad4ecc995aa")


def asset_uuid(name):
    return str(uuid.uuid5(NAMESPACE, name.replace("\\", "/")))


def digest(value):
    return hashlib.sha256(value).hexdigest() if value is not None else None


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()


def texture_meta(name, width, height):
    ident, frame = asset_uuid(name), asset_uuid(name + "#sprite")
    return dict(ver="2.3.7", uuid=ident, importer="texture", type="sprite", wrapMode="clamp", filterMode="bilinear",
                premultiplyAlpha=False, genMipmaps=False, packable=False, width=width, height=height, platformSettings={},
                subMetas={Path(name).stem: dict(ver="1.0.6", uuid=frame, importer="sprite-frame", rawTextureUuid=ident,
                    trimType="none", trimThreshold=1, rotated=False, offsetX=0, offsetY=0, trimX=0, trimY=0,
                    width=width, height=height, rawWidth=width, rawHeight=height,
                    borderTop=0, borderBottom=0, borderLeft=0, borderRight=0, subMetas={})})


def _atlas_layouts(images, maximum, groups):
    """Keep co-used regions together without duplicating or resampling them."""
    def order(guids):
        return sorted(guids, key=lambda guid: (-images[guid]["height"], guid))

    def shelf(guids):
        pages, x, y, row = [[]], 2, 2, 0
        for guid in order(guids):
            width, height = images[guid]["width"], images[guid]["height"]
            if x + width + 2 > maximum:
                x, y, row = 2, y + row + 4, 0
            if y + height + 2 > maximum:
                pages.append([]); x, y, row = 2, 2, 0
            pages[-1].append((guid, x, y))
            x += width + 4; row = max(row, height)
        return pages

    for item in images.values():
        width, height = item["width"], item["height"]
        if width + 4 > maximum or height + 4 > maximum:
            raise ValueError("Sprite exceeds the supported atlas size")
    if not groups:
        return shelf(images)

    parent = {guid: guid for guid in images}
    def find(guid):
        while parent[guid] != guid:
            parent[guid] = parent[parent[guid]]; guid = parent[guid]
        return guid

    for group in groups:
        members = sorted(set(group))
        if set(members) - images.keys():
            raise ValueError("Atlas group references an unknown sprite")
        for guid in members[1:]:
            left, right = find(members[0]), find(guid)
            parent[max(left, right)] = min(left, right)
    components = {}
    for guid in sorted(images):
        components.setdefault(find(guid), []).append(guid)
    area = lambda guids: sum(images[guid]["width"] * images[guid]["height"] for guid in guids)
    size = lambda entries: ((max(x + images[guid]["width"] + 2 for guid, x, y in entries) - 1).bit_length(),
                            (max(y + images[guid]["height"] + 2 for guid, x, y in entries) - 1).bit_length())
    pixels = lambda entries: 2 ** sum(size(entries))
    pages = []
    for group in sorted(components.values(), key=lambda members: (-area(members), tuple(members))):
        own = shelf(group)
        if len(own) > 1:
            # A connected family can exceed one page. Keep its exact pixels
            # on capped pages rather than shrinking it or refusing a valid rig.
            pages.extend(own)
            continue
        candidates = []
        for index, page in enumerate(pages):
            combined = [guid for guid, _, _ in page] + group
            trial = shelf(combined)
            if len(trial) == 1:
                footprint = pixels(trial[0])
                candidates.append((footprint - pixels(page), footprint - area(combined), index, trial[0]))
        if candidates:
            _, _, index, entries = min(candidates, key=lambda candidate: candidate[:3])
            pages[index] = entries
        else:
            pages.extend(own)
    return pages


def atlas_pages(images, maximum=2048, groups=None):
    from PIL import Image
    if maximum < 8 or maximum > 2048 or maximum & (maximum - 1):
        raise ValueError("Character atlas pages must use a power-of-two limit up to 2048")
    if not images:
        return [], {}
    pages, placements = _atlas_layouts(images, maximum, groups), {}
    for index, entries in enumerate(pages):
        for guid, x, y in entries:
            placements[guid] = (index, x, y)
    result = []
    for entries in pages:
        width = 2 ** (max(x+images[g]["width"]+2 for g,x,y in entries)-1).bit_length()
        height = 2 ** (max(y+images[g]["height"]+2 for g,x,y in entries)-1).bit_length()
        page = Image.new("RGBA", (width, height))
        for guid, x, y in entries:
            sprite = images[guid]["image"]; w,h = sprite.size
            # Atlas packing copies original pixels. Extrusion prevents bilinear
            # sampling from pulling transparent seams into small world units.
            page.paste(sprite, (x,y))
            page.paste(sprite.crop((0,0,1,h)).resize((2,h), Image.Resampling.NEAREST), (x-2,y))
            page.paste(sprite.crop((w-1,0,w,h)).resize((2,h), Image.Resampling.NEAREST), (x+w,y))
            page.paste(sprite.crop((0,0,w,1)).resize((w,2), Image.Resampling.NEAREST), (x,y-2))
            page.paste(sprite.crop((0,h-1,w,h)).resize((w,2), Image.Resampling.NEAREST), (x,y+h))
        output = io.BytesIO(); page.save(output, format="PNG")
        result.append((output.getvalue(), width, height))
    return result, placements


def attachment_regions(rig):
    """Include every skin, not only the active/default appearance."""
    skins = rig.get("skins", [])
    skins = [dict(attachments=value) for value in skins.values()] if isinstance(skins, dict) else skins
    return {attachment.get("path", attachment.get("name", name))
            for skin in skins for slot in skin.get("attachments", {}).values()
            for name, attachment in slot.items()
            if attachment.get("type", "region") in ("region", "mesh", "linkedmesh", "skinnedmesh", "weightedmesh")}


def atlas_region_groups(images, rigs):
    identifiers = {info["region"]: guid for guid, info in images.items()}
    return [[identifiers[name] for name in sorted(attachment_regions(rig))] for rig in rigs]


def atlas_text(images, placements, pages, page_names, region_blocks=None, page_properties=None):
    lines = []
    for index, (_, width, height) in enumerate(pages):
        lines.extend(["", page_names[index], "size: " + str(width) + "," + str(height)])
        lines.extend(page_properties if page_properties is not None else
                     ["format: RGBA8888", "filter: Linear,Linear", "repeat: none"])
        for guid, (page, x, y) in sorted(placements.items()):
            if page != index:
                continue
            info = images[guid]
            if region_blocks is not None:
                # Keep original trim, offsets, rotation, indices and unknown
                # region properties. Repacking changes only the page and UVs.
                block = list(region_blocks[info["region"]])
                for at, line in enumerate(block):
                    if line.strip().startswith("xy:"):
                        block[at] = "  xy: " + str(x) + ", " + str(y)
                lines.extend(block)
            else:
                w, h = info["width"], info["height"]
                lines.extend([info["region"], "  rotate: false", f"  xy: {x}, {y}",
                              f"  size: {w}, {h}", f"  orig: {w}, {h}", "  offset: 0, 0", "  index: -1"])
    return ("\n".join(lines) + "\n").encode()


class Transaction:
    def __init__(self, project, artifacts):
        self.project = project.resolve(); self.artifacts = artifacts.resolve()
        if self.artifacts.is_relative_to(self.project):
            raise ValueError("Import staging/backups must be outside the repository")
        self.plan, self.reads, self.managed, self.directory_reads = {}, {}, {}, {}

    def files(self, relative, pattern):
        directory = self.project / relative
        if not directory.resolve().is_relative_to(self.project):
            raise ValueError("Import directory leaves the project")
        for parent in (directory, *directory.parents):
            if parent == self.project:
                break
            if parent.is_symlink():
                raise ValueError("Symbolic link in import directory")
        rows = sorted(directory.glob(pattern))
        names = tuple(file.name for file in rows)
        key = (relative, pattern)
        if key in self.directory_reads and self.directory_reads[key] != names:
            raise ValueError("Concurrent change in directory: " + relative)
        self.directory_reads[key] = names
        return rows

    def _check_directories(self, published=False):
        for (relative, pattern), before in self.directory_reads.items():
            expected = set(before)
            if published:
                for name, (_, after) in self.plan.items():
                    file = Path(name)
                    if file.parent.as_posix() == relative and file.match(pattern):
                        if after is None:
                            expected.discard(file.name)
                        else:
                            expected.add(file.name)
            current = {file.name for file in (self.project / relative).glob(pattern)}
            if current != expected:
                raise ValueError("Concurrent change in directory: " + relative)

    def read(self, relative):
        target = self.project / relative
        if not target.resolve().is_relative_to(self.project):
            raise ValueError("Import destination leaves the project")
        for parent in (target, *target.parents):
            if parent == self.project: break
            if parent.is_symlink(): raise ValueError("Symbolic link in destination")
        if relative not in self.reads:
            self.reads[relative] = target.read_bytes() if target.exists() else None
        return self.reads[relative]

    def stage(self, relative, data):
        before = self.read(relative)
        expected = self.managed.get(relative)
        if before is not None and before != data and expected and digest(before) != expected:
            raise ValueError("Imported asset was edited; keep it before reimporting: " + relative)
        if data != before: self.plan[relative] = (before, data)

    def json(self, relative, data, preserve=False):
        before = self.read(relative)
        if before is not None:
            old = json.loads(before.decode("utf-8-sig"))
            if preserve: data = dict(data, **old)
            if data == old: return old
        self.stage(relative, encoded(data)); return data

    def folder(self, relative):
        self.json(relative+".meta", dict(ver="1.1.3", uuid=asset_uuid(relative), importer="folder", isBundle=False,
            bundleName="", priority=1, compressionType={}, optimizeHotUpdate={}, inlineSpriteFrames={}, isRemoteBundle={}, subMetas={}), True)

    def _publish(self, source, target, before, copy_only=False):
        """Publish atomically even when the external backup is on another disk."""
        def check():
            if (target.read_bytes() if target.exists() else None) != before:
                raise ValueError("Concurrent change: " + str(target.relative_to(self.project)))
        check()
        if not copy_only:
            try:
                os.replace(source, target)
                return
            except OSError as error:
                if error.errno != errno.EXDEV and getattr(error, "winerror", None) != 17:
                    raise
        # Creator ignores dot-prefixed files. The final rename stays on the
        # target volume; the durable original backup always stays outside it.
        temporary = target.parent / (".unit-import-" + uuid.uuid4().hex + ".tmp")
        try:
            with source.open("rb") as reader, temporary.open("xb") as writer:
                shutil.copyfileobj(reader, writer)
                writer.flush()
                os.fsync(writer.fileno())
            check()
            os.replace(temporary, target)
        finally:
            if temporary.exists():
                temporary.unlink()

    def commit(self):
        if not self.plan: return None
        self.plan = dict(sorted(self.plan.items(), key=lambda pair: not pair[0].endswith(".meta")))
        stamp = str(int(time.time()*1000))+"-"+uuid.uuid4().hex[:8]
        backup = self.artifacts / ("import-"+stamp); backup.mkdir(parents=True)
        journal = dict(status="prepared", files=[])
        for relative, (before, after) in self.plan.items():
            journal["files"].append(dict(path=relative, before=digest(before), after=digest(after)))
            for group, data in (("original",before),("staged",after)):
                if data is not None:
                    target=backup/group/(digest(relative.encode())+".bin"); target.parent.mkdir(parents=True,exist_ok=True); target.write_bytes(data)
        logfile=backup/"transaction.json"; logfile.write_bytes(encoded(journal)); committed=[]
        try:
            for relative, before in self.reads.items():
                target=self.project/relative; current=target.read_bytes() if target.exists() else None
                if current != before: raise ValueError("Concurrent change: "+relative)
            self._check_directories()
            for relative, (before,after) in self.plan.items():
                target=self.project/relative; target.parent.mkdir(parents=True,exist_ok=True)
                self._publish(backup/"staged"/(digest(relative.encode())+".bin"),target,before); committed.append(relative)
            for relative, (_,after) in self.plan.items():
                if (self.project/relative).read_bytes()!=after: raise ValueError("Concurrent change after publication: "+relative)
            self._check_directories(published=True)
            journal["status"]="complete"
        except Exception as error:
            conflicts=[]
            for relative in reversed(committed):
                before,after=self.plan[relative]; target=self.project/relative
                try:
                    if (target.read_bytes() if target.exists() else None)!=after:
                        conflicts.append(relative); continue
                    if before is None: target.unlink()
                    else: self._publish(backup/"original"/(digest(relative.encode())+".bin"),target,after,copy_only=True)
                except (OSError, ValueError):
                    conflicts.append(relative)
            journal.update(status="recovery-required" if conflicts else "rolled-back", conflicts=conflicts, error=str(error))
            raise
        finally: logfile.write_bytes(encoded(journal))
        return str(backup)


def _planned_read(tx, relative):
    if relative in tx.plan:
        return tx.plan[relative][1]
    return tx.read(relative)


def update_texture_dimensions(meta, width, height):
    """Refresh derived sizes, keeping authored identifiers, settings and slices."""
    meta = copy.deepcopy(meta)
    old_width, old_height = meta.get("width"), meta.get("height")
    meta["width"], meta["height"] = width, height
    def update(rows):
        for entry in rows.values():
            if entry.get("importer") == "sprite-frame":
                raw_width, raw_height = entry.get("rawWidth", old_width), entry.get("rawHeight", old_height)
                full = (entry.get("width") == raw_width and entry.get("height") == raw_height and
                        entry.get("trimType") != "custom" and not entry.get("trimX", 0) and
                        not entry.get("trimY", 0) and not entry.get("rotated", False))
                entry["rawWidth"], entry["rawHeight"] = width, height
                if full:
                    entry["width"], entry["height"] = width, height
            update(entry.get("subMetas", {}))
    update(meta.get("subMetas", {}))
    return meta


def stage_page_copy(tx, source, destination):
    """Share one sibling page per pack, without duplicating imported UUIDs."""
    raw = _planned_read(tx, source)
    if raw is None or len(raw) < 24 or raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Missing or invalid atlas PNG: " + source)
    expected = tx.managed.get(source)
    if source not in tx.plan and expected and digest(raw) != expected:
        raise ValueError("Imported atlas page was edited: " + source)
    width, height = struct.unpack(">II", raw[16:24])
    if not width or not height:
        raise ValueError("Invalid atlas dimensions: " + source)
    before = tx.read(destination)
    if before is not None and before != raw and destination not in tx.managed:
        raise ValueError("Unmanaged sibling atlas page already exists: " + destination)
    tx.stage(destination, raw)
    existing = tx.read(destination + ".meta")
    if existing is not None:
        meta = json.loads(existing.decode("utf-8-sig"))
    else:
        original = _planned_read(tx, source + ".meta")
        meta = json.loads(original.decode("utf-8-sig")) if original else texture_meta(destination, width, height)
        meta = copy.deepcopy(meta)
        meta["uuid"] = asset_uuid(destination)
        # Texture settings and unknown metadata survive in the new copy, but
        # its asset/subasset identifiers must differ from the original page.
        def update_subassets(rows, prefix=""):
            for name, entry in rows.items():
                key = prefix + name
                if "uuid" in entry:
                    suffix = "#sprite" if not prefix and len(rows) == 1 and entry.get("importer") == "sprite-frame" else "#submeta:" + key
                    entry["uuid"] = asset_uuid(destination + suffix)
                if "rawTextureUuid" in entry:
                    entry["rawTextureUuid"] = meta["uuid"]
                update_subassets(entry.get("subMetas", {}), key + "/")
        update_subassets(meta.get("subMetas", {}))
    if meta.get("importer") != "texture" or not meta.get("uuid"):
        raise ValueError("Invalid sibling texture metadata: " + destination)
    original_meta = _planned_read(tx, source + ".meta")
    if original_meta and meta["uuid"] == json.loads(original_meta.decode("utf-8-sig")).get("uuid"):
        raise ValueError("Sibling atlas page duplicates its source UUID: " + destination)
    meta = update_texture_dimensions(meta, width, height)
    tx.json(destination + ".meta", meta)
    return meta


def atlas_page_headers(raw):
    lines = raw.decode("utf-8").splitlines(keepends=True)
    rows = []
    for index, line in enumerate(lines):
        name = line.strip().lstrip("\ufeff")
        if not name or index > 0 and lines[index - 1].strip() or index + 1 >= len(lines):
            continue
        if re.match(r"^(size|format):", lines[index + 1].strip()):
            rows.append((index, name))
    if not rows:
        raise ValueError("Atlas has no page headers")
    return lines, rows


def plan_atlas_layout(tx, kinds):
    """Repair Creator's basename-only atlas lookup; stage no gameplay edits."""
    counts = dict(packs=0, units=0, pages=0, rewrittenAtlases=0, textureReferences=0)
    for kind in kinds:
        target = "assets/resources/unit-library/" + kind
        manifest_file = target + "/catalog.json"
        raw_manifest = tx.read(manifest_file)
        if raw_manifest is None:
            raise ValueError("Missing imported unit catalog: " + manifest_file)
        manifest = json.loads(raw_manifest.decode("utf-8-sig"))
        tx.managed.update(manifest.get("importedFiles", {}))
        managed = dict(manifest.get("importedFiles", {}))
        seen = {}
        for unit in manifest.get("units", []):
            skeleton = unit["skeleton"]
            if not skeleton.startswith(target + "/Units/") or "/../" in skeleton or not skeleton.endswith(".json"):
                raise ValueError("Unexpected imported unit resource: " + skeleton)
            if tx.read(skeleton) is None:
                raise ValueError("Missing imported skeleton: " + skeleton)
            atlas = skeleton[:-5] + ".atlas"
            raw = tx.read(atlas)
            if raw is None:
                raise ValueError("Missing unit atlas: " + atlas)
            expected = tx.managed.get(atlas)
            if expected and digest(raw) != expected:
                raise ValueError("Imported unit atlas was edited: " + atlas)
            lines, headers = atlas_page_headers(raw)
            textures = []
            for index, header in headers:
                name = Path(header.replace("\\", "/")).name
                source = target + "/Atlases/" + name
                destination = target + "/Units/" + name
                resolved = (tx.project / Path(atlas).parent / header).resolve()
                if resolved not in [(tx.project / source).resolve(), (tx.project / destination).resolve()]:
                    raise ValueError("Unmanaged unit atlas page: " + header)
                if destination not in seen:
                    seen[destination] = stage_page_copy(tx, source, destination)
                    managed[destination] = digest(_planned_read(tx, destination))
                textures.append(seen[destination]["uuid"])
                ending = lines[index][len(lines[index].rstrip("\r\n")):]
                bom = "\ufeff" if lines[index].startswith("\ufeff") else ""
                lines[index] = bom + name + ending
            after = "".join(lines).encode("utf-8")
            if after != raw:
                counts["rewrittenAtlases"] += 1
            tx.stage(atlas, after)
            managed[atlas] = digest(after)
            metadata_file = skeleton + ".meta"
            raw_meta = tx.read(metadata_file)
            if raw_meta is None:
                raise ValueError("Missing imported skeleton metadata: " + skeleton)
            meta = json.loads(raw_meta.decode("utf-8-sig"))
            if meta.get("uuid") != unit["uuid"]:
                raise ValueError("Unit UUID changed outside its catalog: " + skeleton)
            if meta.get("textures") != textures:
                counts["textureReferences"] += 1
                tx.json(metadata_file, dict(meta, textures=textures))
            counts["units"] += 1
        manifest["importedFiles"] = managed
        tx.json(manifest_file, manifest)
        counts["packs"] += 1
        counts["pages"] += len(seen)
    counts["files"] = len(tx.plan)
    return counts


def repair_atlas_layout(project, artifacts, kinds=None, dry_run=False):
    tx = Transaction(project, artifacts)
    result = plan_atlas_layout(tx, kinds or ["character-maker", "monster1", "monster2", "monster3"])
    result["backup"] = None if dry_run else tx.commit()
    result["dryRun"] = dry_run
    return result


def _stage_atlas_pages(tx, target, kind, pages):
    names, textures = [], []
    for index, (png, width, height) in enumerate(pages):
        relative = target + "/Atlases/" + kind + "-" + str(index) + ".png"
        tx.stage(relative, png)
        meta = tx.json(relative + ".meta", texture_meta(relative, width, height), True)
        tx.json(relative + ".meta", update_texture_dimensions(meta, width, height))
        sibling = target + "/Units/" + Path(relative).name
        sibling_meta = stage_page_copy(tx, relative, sibling)
        names.append(Path(sibling).name)
        textures.append(sibling_meta["uuid"])
    return names, textures


def _read_atlas_regions(raw):
    lines, headers = atlas_page_headers(raw)
    regions, common_properties = {}, None
    for number, (start, page_name) in enumerate(headers):
        end = headers[number + 1][0] if number + 1 < len(headers) else len(lines)
        at, properties = start + 1, []
        while at < end and ":" in lines[at] and not lines[at].startswith((" ", "\t")):
            value = lines[at].strip()
            if not value.startswith("size:"):
                properties.append(value)
            at += 1
        if common_properties is not None and common_properties != properties:
            raise ValueError("Atlas pages have different sampling properties")
        common_properties = properties
        while at < end:
            if not lines[at].strip():
                at += 1
                continue
            name, block = lines[at].strip(), [lines[at].rstrip("\r\n")]
            at += 1
            while at < end and lines[at].startswith((" ", "\t")):
                block.append(lines[at].rstrip("\r\n")); at += 1
            fields = dict(line.strip().split(":", 1) for line in block[1:] if ":" in line)
            if name in regions or fields.get("rotate", "false").strip() != "false":
                raise ValueError("Duplicate or rotated region requires a separate migration: " + name)
            regions[name] = dict(page=Path(page_name.replace("\\", "/")).name, block=block,
                                 xy=tuple(int(n.strip()) for n in fields["xy"].split(",")),
                                 size=tuple(int(n.strip()) for n in fields["size"].split(",")))
    return regions, common_properties


def plan_repack_atlases(tx, kinds):
    """Losslessly repack shared imported pages, preserving every existing rig."""
    from PIL import Image
    result = dict(packs=0, units=0, pages=0, retainedRegions=0, omittedRegions=0)
    for kind in kinds:
        if kind not in ("monster1", "monster2", "monster3", "character-maker"):
            raise ValueError("Unsupported imported unit pack: " + kind)
        target = "assets/resources/unit-library/" + kind
        manifest_file = target + "/catalog.json"
        manifest = json.loads(tx.read(manifest_file).decode("utf-8-sig"))
        tx.managed.update(manifest.get("importedFiles", {}))
        units, rigs, needed, original_atlas = [], [], set(), None
        # Include user-authored and campaign variants outside catalog.units.
        for file in tx.files(target + "/Units", "*.json"):
            relative = file.relative_to(tx.project).as_posix()
            rig = json.loads(tx.read(relative).decode("utf-8-sig"))
            rigs.append(rig)
            needed.update(attachment_regions(rig))
            atlas_file = relative[:-5] + ".atlas"
            raw = tx.read(atlas_file)
            if original_atlas is not None and raw != original_atlas:
                raise ValueError("Unit atlas differs from the shared pack: " + atlas_file)
            original_atlas = raw
            units.append((relative, atlas_file))
        if not units or not needed:
            raise ValueError("No drawable imported unit regions: " + kind)
        regions, properties = _read_atlas_regions(original_atlas)
        if needed - regions.keys():
            raise ValueError("Missing unit atlas regions: " + str(sorted(needed - regions.keys())))
        parts = {"u_" + part["guid"]: part for part in manifest["parts"]}
        if needed - parts.keys():
            raise ValueError("Atlas regions have no original sprite: " + str(sorted(needed - parts.keys())))
        images, old_pages = {}, {}
        for name in sorted(needed):
            part, region = parts[name], regions[name]
            raw = tx.read(part["image"])
            if digest(raw) != part["sha256"]:
                raise ValueError("Original sprite changed outside its catalog: " + part["image"])
            image = Image.open(io.BytesIO(raw)).convert("RGBA")
            if image.size != region["size"]:
                raise ValueError("Original sprite dimensions changed: " + part["image"])
            if region["page"] not in old_pages:
                page_file = target + "/Atlases/" + region["page"]
                old_pages[region["page"]] = Image.open(io.BytesIO(tx.read(page_file))).convert("RGBA")
            x, y = region["xy"]; width, height = image.size
            if x < 0 or y < 0 or x + width > old_pages[region["page"]].width or y + height > old_pages[region["page"]].height:
                raise ValueError("Atlas region exceeds its source page: " + name)
            if old_pages[region["page"]].crop((x, y, x + width, y + height)).tobytes() != image.tobytes():
                raise ValueError("Atlas artwork differs from its source sprite: " + name)
            images[part["guid"]] = dict(image=image, width=width, height=height, region=name)
        pages, placements = atlas_pages(images, groups=atlas_region_groups(images, rigs))
        names, textures = _stage_atlas_pages(tx, target, kind, pages)
        atlas = atlas_text(images, placements, pages, names,
                           {name: region["block"] for name, region in regions.items()}, properties)
        for relative, atlas_file in units:
            tx.stage(atlas_file, atlas)
            meta_file = relative + ".meta"
            meta = json.loads(tx.read(meta_file).decode("utf-8-sig"))
            if meta.get("textures") != textures:
                tx.json(meta_file, dict(meta, textures=textures))
        managed = dict(manifest.get("importedFiles", {}))
        for relative, (_, after) in tx.plan.items():
            if relative.startswith(target + "/") and not relative.endswith(".meta") and relative != manifest_file:
                managed[relative] = digest(after)
        manifest["importedFiles"] = managed
        manifest["conversion"] = dict(manifest.get("conversion", {}), atlasMaxSize=2048,
                                      atlasRegions="all-unit-skins", atlasGrouping="unit-co-usage",
                                      packedRegions=len(needed))
        tx.json(manifest_file, manifest)
        result["packs"] += 1; result["units"] += len(units); result["pages"] += len(pages)
        result["retainedRegions"] += len(needed); result["omittedRegions"] += len(regions) - len(needed)
    result["files"] = len(tx.plan)
    return result


def repack_atlases(project, artifacts, kinds=None, dry_run=False):
    tx = Transaction(project, artifacts)
    result = plan_repack_atlases(tx, kinds or ["monster1", "monster2"])
    result["backup"] = None if dry_run else tx.commit()
    result["dryRun"] = dry_run
    return result


def import_pack(project, file, kind, artifacts):
    from unity_monsters import convert_prefab, image_info, unpack
    tx=Transaction(project,artifacts)
    root="assets/resources/unit-library"; target=root+"/"+kind
    manifest_file=target+"/catalog.json"; old=tx.read(manifest_file)
    manifest=json.loads(old.decode("utf-8-sig")) if old else {}
    tx.managed=manifest.get("importedFiles",{})
    entries=unpack(file); images={item["guid"]:image_info(item) for name,item in entries.items() if name.lower().endswith(".png")}
    tx.folder(root); tx.folder(target)
    for directory in ("Sprites","Atlases","Units"): tx.folder(target+"/"+directory)
    prefabs=[item for name,item in sorted(entries.items()) if name.endswith(".prefab") and "/Prefabs/UI/" not in name]
    converted=[(item,convert_prefab(item,entries,images,character=kind=="character-maker")) for item in prefabs]
    generated={target+"/Units/"+Path(item["name"]).stem+".json" for item,_ in converted}
    rigs=[rig for _,rig in converted]
    needed=set().union(*(attachment_regions(rig) for rig in rigs))
    variants=[]
    for variant_file in tx.files(target+"/Units", "*.json"):
        relative=variant_file.relative_to(tx.project).as_posix()
        if relative not in generated:
            rig=json.loads(tx.read(relative).decode("utf-8-sig"))
            rigs.append(rig)
            needed.update(attachment_regions(rig))
            variants.append(relative)
    known={info["region"] for info in images.values()}
    if needed-known:
        raise ValueError("Preserved unit references sprites missing from the package: "+str(sorted(needed-known)))
    # Keep every original image for authoring. Runtime pages need only images
    # used by the converted rigs and retained variants, across all their skins.
    packed_images={guid:info for guid,info in images.items() if not needed or info["region"] in needed}
    pages,placements=atlas_pages(packed_images,groups=atlas_region_groups(packed_images,rigs))
    names,textures=_stage_atlas_pages(tx,target,kind,pages)
    atlas=atlas_text(packed_images,placements,pages,names);parts=[];units=[]
    for name,item in sorted(entries.items()):
        if name.lower().endswith(".png"):
            info=images[item["guid"]]
            # Source paths after the package root preserve categories and names.
            suffix=name.split("/EnemyMonster ",1)[-1].split("/",1)[-1] if kind.startswith("monster") else name.split("/2D Minimal-CharacterMaker/",1)[-1]
            relative=target+"/Sprites/"+suffix
            directory=str(Path(relative).parent).replace("\\","/")
            for parent in reversed(list(Path(directory).parents)):
                path=str(parent).replace("\\","/")
                if path.startswith(target+"/"):tx.folder(path)
            tx.folder(directory);tx.stage(relative,item["asset"])
            tx.json(relative+".meta",texture_meta(relative,info["width"],info["height"]),True)
            parts.append(dict(id=kind+"/"+suffix[:-4],name=Path(name).stem,image=relative,resource=relative[len("assets/resources/"):-4],
                guid=item["guid"],width=info["width"],height=info["height"],pivot=info["pivot"],pixelsPerUnit=info["ppu"],sha256=digest(item["asset"])))
        elif name.endswith(".txt") and "Guide" in name:
            relative=target+"/"+Path(name).name;tx.stage(relative,item["asset"])
            tx.json(relative+".meta",dict(ver="1.0.3",uuid=asset_uuid(relative),importer="text",subMetas={}),True)
    for item,rig in converted:
        name=Path(item["name"]).stem
        relative=target+"/Units/"+name+".json"
        tx.json(relative,rig)
        meta=tx.json(relative+".meta",dict(ver="1.2.5",uuid=asset_uuid(relative),importer="spine",textures=textures,scale=1,subMetas={}),True)
        if meta.get("textures") != textures:
            meta=dict(meta,textures=textures);tx.json(relative+".meta",meta)
        tx.stage(relative[:-5]+".atlas",atlas)
        tx.json(relative[:-5]+".atlas.meta",dict(ver="1.0.3",uuid=asset_uuid(relative[:-5]+".atlas"),importer="asset",subMetas={}),True)
        units.append(dict(id=kind+"/"+name,name=name.replace("_"," "),pack=kind,source=item["name"],skeleton=relative,uuid=meta["uuid"],
            resource=relative[len("assets/resources/"):-5],animations=list(rig["animations"]),bones=len(rig["bones"]),slots=len(rig["slots"])))
    for relative in variants:
        tx.stage(relative[:-5]+".atlas",atlas)
        meta_file=relative+".meta";meta=json.loads(tx.read(meta_file).decode("utf-8-sig"))
        if meta.get("textures")!=textures:tx.json(meta_file,dict(meta,textures=textures))
    prior_units={item["id"]:item for item in manifest.get("units",[])}
    prior_parts={item["id"]:item for item in manifest.get("parts",[])}
    units=[dict(prior_units.get(item["id"],{}),**item) for item in units]
    parts=[dict(prior_parts.get(item["id"],{}),**item) for item in parts]
    managed=dict(tx.managed)
    for relative,before in tx.reads.items():
        if relative.startswith(target+"/") and not relative.endswith(".meta") and relative!=manifest_file:
            after=tx.plan[relative][1] if relative in tx.plan else before
            if after is not None: managed[relative]=digest(after)
    manifest.update(version=1,source=dict(manifest.get("source",{}),publisher="Layer Lab",package=file.name,sha256=digest(file.read_bytes())),units=units,parts=parts,
        conversion=dict(manifest.get("conversion",{}),runtime="Spine 3.8",sampleRate=60,unityScriptsImported=False,
                        unityMaterialsImported=False,atlasMaxSize=2048,atlasRegions="all-unit-skins",
                        atlasGrouping="unit-co-usage",packedRegions=len(packed_images)),importedFiles=managed)
    tx.json(manifest_file,manifest);tx.json(manifest_file+".meta",dict(ver="1.2.7",uuid=asset_uuid(manifest_file),importer="json",subMetas={}),True)
    result=dict(kind=kind,units=len(units),sprites=len(parts),atlases=len(pages),files=len(tx.plan),backup=tx.commit())
    return result


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package",type=Path,nargs="?");parser.add_argument("--kind",choices=["monster1","monster2","monster3","character-maker"])
    parser.add_argument("--repair-atlas-layout",action="store_true",help="Add shared sibling atlas pages for Creator 2.4; preserve unit resources and UUIDs")
    parser.add_argument("--repack-atlases",action="store_true",help="Losslessly repack existing Monster 1/2 shared pages at 2048px; preserve all unit rigs")
    parser.add_argument("--dry-run",action="store_true",help="Validate atlas repacking or layout repair without writing files")
    parser.add_argument("--project",type=Path,default=Path(__file__).resolve().parents[2])
    parser.add_argument("--artifacts",type=Path,default=Path.home()/"Documents/Codex Artifacts/HeroKingdomDefense/unit-imports")
    args=parser.parse_args()
    if args.repack_atlases:
        if args.package or args.repair_atlas_layout: parser.error("Atlas repacking does not take a Unity package or layout repair")
        result=repack_atlases(args.project,args.artifacts,[args.kind] if args.kind else None,args.dry_run)
    elif args.repair_atlas_layout:
        if args.package: parser.error("Atlas layout repair does not take a Unity package")
        result=repair_atlas_layout(args.project,args.artifacts,[args.kind] if args.kind else None,args.dry_run)
    else:
        if not args.package or not args.kind: parser.error("Import requires a Unity package and --kind")
        if args.dry_run: parser.error("--dry-run requires --repair-atlas-layout or --repack-atlases")
        result=import_pack(args.project,args.package,args.kind,args.artifacts)
    print(json.dumps(result,indent=2))
