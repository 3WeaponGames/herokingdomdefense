"""Import Character Maker and Minimal Monster Unity packs into Creator 2.4.

Usage: python tools/characters/import_units.py <unitypackage> --kind monster1
Dependencies: Pillow, PyYAML. Originals and transaction logs stay outside the repo.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import time
import uuid

from PIL import Image
from unity_monsters import convert_prefab, image_info, unpack

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


def atlas_pages(images, maximum=4096):
    pages, placements = [], {}
    page, x, y, row = 0, 2, 2, 0
    pages.append([])
    for guid, item in sorted(images.items(), key=lambda row: (-row[1]["height"], row[0])):
        width, height = item["width"], item["height"]
        if width + 4 > maximum or height + 4 > maximum:
            raise ValueError("Sprite exceeds the supported atlas size")
        if x + width + 2 > maximum:
            x, y, row = 2, y + row + 4, 0
        if y + height + 2 > maximum:
            pages.append([]); page += 1; x, y, row = 2, 2, 0
        pages[page].append((guid, x, y)); placements[guid] = (page, x, y)
        x += width + 4; row = max(row, height)
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
            page.paste(sprite.crop((0,0,1,h)).resize((2,h)), (x-2,y))
            page.paste(sprite.crop((w-1,0,w,h)).resize((2,h)), (x+w,y))
            page.paste(sprite.crop((0,0,w,1)).resize((w,2)), (x,y-2))
            page.paste(sprite.crop((0,h-1,w,h)).resize((w,2)), (x,y+h))
        output = io.BytesIO(); page.save(output, format="PNG")
        result.append((output.getvalue(), width, height))
    return result, placements


class Transaction:
    def __init__(self, project, artifacts):
        self.project = project.resolve(); self.artifacts = artifacts.resolve()
        if self.artifacts.is_relative_to(self.project):
            raise ValueError("Import staging/backups must be outside the repository")
        self.plan, self.reads, self.managed = {}, {}, {}

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

    def commit(self):
        if not self.plan: return None
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
            for relative, (before,after) in self.plan.items():
                target=self.project/relative; target.parent.mkdir(parents=True,exist_ok=True)
                os.replace(backup/"staged"/(digest(relative.encode())+".bin"),target); committed.append(relative)
            journal["status"]="complete"
        except Exception as error:
            conflicts=[]
            for relative in reversed(committed):
                before,after=self.plan[relative]; target=self.project/relative
                if target.read_bytes()!=after: conflicts.append(relative); continue
                if before is None: target.unlink()
                else: target.write_bytes(before)
            journal.update(status="recovery-required" if conflicts else "rolled-back", conflicts=conflicts, error=str(error))
            raise
        finally: logfile.write_bytes(encoded(journal))
        return str(backup)


def import_pack(project, file, kind, artifacts):
    tx=Transaction(project,artifacts)
    root="assets/resources/unit-library"; target=root+"/"+kind
    manifest_file=target+"/catalog.json"; old=tx.read(manifest_file)
    manifest=json.loads(old.decode("utf-8-sig")) if old else {}
    tx.managed=manifest.get("importedFiles",{})
    entries=unpack(file); images={item["guid"]:image_info(item) for name,item in entries.items() if name.lower().endswith(".png")}
    tx.folder(root); tx.folder(target)
    for directory in ("Sprites","Atlases","Units"): tx.folder(target+"/"+directory)
    pages, placements=atlas_pages(images)
    atlas_lines=[]; textures=[]
    for index,(png,width,height) in enumerate(pages):
        relative=target+"/Atlases/"+kind+"-"+str(index)+".png"
        tx.stage(relative,png); meta=tx.json(relative+".meta",texture_meta(relative,width,height),True); textures.append(meta["uuid"])
        atlas_lines.extend(["", "../Atlases/"+kind+"-"+str(index)+".png", "size: "+str(width)+","+str(height),"format: RGBA8888","filter: Linear,Linear","repeat: none"])
        for guid,(page,x,y) in sorted(placements.items()):
            if page!=index:continue
            info=images[guid]; w,h=info["width"],info["height"]
            atlas_lines.extend([info["region"],"  rotate: false",f"  xy: {x}, {y}",f"  size: {w}, {h}",f"  orig: {w}, {h}","  offset: 0, 0","  index: -1"])
    atlas=("\n".join(atlas_lines)+"\n").encode(); parts=[]; units=[]
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
    prefabs=[item for name,item in sorted(entries.items()) if name.endswith(".prefab") and "/Prefabs/UI/" not in name]
    for item in prefabs:
        name=Path(item["name"]).stem
        rig=convert_prefab(item,entries,images,character=kind=="character-maker")
        relative=target+"/Units/"+name+".json"
        tx.json(relative,rig)
        meta=tx.json(relative+".meta",dict(ver="1.2.5",uuid=asset_uuid(relative),importer="spine",textures=textures,scale=1,subMetas={}),True)
        tx.stage(relative[:-5]+".atlas",atlas)
        tx.json(relative[:-5]+".atlas.meta",dict(ver="1.0.3",uuid=asset_uuid(relative[:-5]+".atlas"),importer="asset",subMetas={}),True)
        units.append(dict(id=kind+"/"+name,name=name.replace("_"," "),pack=kind,source=item["name"],skeleton=relative,uuid=meta["uuid"],
            resource=relative[len("assets/resources/"):-5],animations=list(rig["animations"]),bones=len(rig["bones"]),slots=len(rig["slots"])))
    prior_units={item["id"]:item for item in manifest.get("units",[])}
    prior_parts={item["id"]:item for item in manifest.get("parts",[])}
    units=[dict(prior_units.get(item["id"],{}),**item) for item in units]
    parts=[dict(prior_parts.get(item["id"],{}),**item) for item in parts]
    managed=dict(tx.managed)
    for relative,before in tx.reads.items():
        if relative.startswith(target+"/") and not relative.endswith(".meta") and relative!=manifest_file:
            after=tx.plan[relative][1] if relative in tx.plan else before
            if after is not None: managed[relative]=digest(after)
    manifest.update(version=1,source=dict(publisher="Layer Lab",package=file.name,sha256=digest(file.read_bytes())),units=units,parts=parts,
        conversion=dict(runtime="Spine 3.8",sampleRate=60,unityScriptsImported=False,unityMaterialsImported=False),importedFiles=managed)
    tx.json(manifest_file,manifest);tx.json(manifest_file+".meta",dict(ver="1.2.7",uuid=asset_uuid(manifest_file),importer="json",subMetas={}),True)
    result=dict(kind=kind,units=len(units),sprites=len(parts),atlases=len(pages),files=len(tx.plan),backup=tx.commit())
    return result


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package",type=Path);parser.add_argument("--kind",required=True,choices=["monster1","monster2","character-maker"])
    parser.add_argument("--project",type=Path,default=Path(__file__).resolve().parents[2])
    parser.add_argument("--artifacts",type=Path,default=Path.home()/"Documents/Codex Artifacts/HeroKingdomDefense/unit-imports")
    args=parser.parse_args(); print(json.dumps(import_pack(args.project,args.package,args.kind,args.artifacts),indent=2))
