"""Read Layer Lab Unity sprite rigs and bake their authored animation to Spine 3.8.

Requires PyYAML and Pillow. No Unity scripts, materials or gameplay are executed.
"""
import copy
import io
import math
import re
import tarfile

import yaml
from PIL import Image

LOADER = getattr(yaml, "CSafeLoader", yaml.SafeLoader)


def documents(raw):
    text = raw.decode("utf-8-sig")
    headers = re.findall(r"^--- !u!(\d+) &(-?\d+)", text, re.M)
    text = re.sub(r"^%[^\n]*\n", "", text, flags=re.M)
    text = re.sub(r"^--- !u!\d+ &-?\d+", "---", text, flags=re.M)
    values = list(yaml.load_all(text, Loader=LOADER))
    if len(values) != len(headers):
        raise ValueError("Invalid Unity document headers")
    return {int(key): (int(kind), next(iter(value.values())))
            for (kind, key), value in zip(headers, values)}


def unpack(file):
    groups = {}
    with tarfile.open(file, "r:gz") as archive:
        for item in archive:
            if not item.isfile():
                continue
            group, _, name = item.name.partition("/")
            if re.fullmatch(r"[a-fA-F0-9]{32}", group) and name in ("pathname", "asset", "asset.meta"):
                groups.setdefault(group, {})[name] = archive.extractfile(item).read()
    result = {}
    for guid, item in groups.items():
        if "pathname" not in item or "asset" not in item:
            continue
        name = item["pathname"].decode("utf-8-sig").splitlines()[0].split("\0")[0]
        if not name.startswith("Assets/") or any(p in ("", ".", "..") for p in name.split("/")):
            raise ValueError("Unsafe Unity asset path: " + name)
        if name in result:
            raise ValueError("Duplicate Unity asset path: " + name)
        result[name] = dict(item, guid=guid, name=name)
    return result


def asset_meta(item):
    return yaml.load(item["asset.meta"].decode("utf-8-sig"), Loader=LOADER)


def image_info(item):
    image = Image.open(io.BytesIO(item["asset"]))
    image.load()
    meta = asset_meta(item).get("TextureImporter", {})
    if meta.get("spriteMode", 1) not in (0, 1):
        raise ValueError("Sliced sprites need a separate converter: " + item["name"])
    pivot = meta.get("spritePivot", {"x": .5, "y": .5})
    return dict(image=image.convert("RGBA"), width=image.width, height=image.height,
                pivot=pivot, ppu=meta.get("spritePixelsToUnits", 100), region="u_" + item["guid"])


def sample(keys, time, field=None):
    def value(key, name="value"):
        result = key.get(name, 0)
        result = result.get(field, 0) if field and isinstance(result, dict) else result
        return float(result) if isinstance(result, str) else result
    if time <= keys[0]["time"]:
        return value(keys[0])
    for left, right in zip(keys, keys[1:]):
        if time > right["time"] + 1e-8:
            continue
        length = right["time"] - left["time"]
        if length <= 0:
            return value(right)
        slope0, slope1 = value(left, "outSlope"), value(right, "inSlope")
        if not math.isfinite(slope0) or not math.isfinite(slope1):
            return value(left) if time < right["time"] else value(right)
        # Unity weighted tangents are cubic Bezier handles in time/value space.
        mode0, mode1 = left.get("weightedMode", 0), right.get("weightedMode", 0)
        weight0 = value(left, "outWeight") if mode0 & 2 else 1 / 3
        weight1 = value(right, "inWeight") if mode1 & 1 else 1 / 3
        x = max(0, min(1, (time - left["time"]) / length))
        lo, hi = 0., 1.
        for _ in range(24):
            t = (lo + hi) / 2
            at = 3 * (1-t)**2 * t * weight0 + 3 * (1-t) * t*t * (1-weight1) + t**3
            if at < x:
                lo = t
            else:
                hi = t
        t = (lo + hi) / 2
        a, b = value(left), value(right)
        return (1-t)**3*a + 3*(1-t)**2*t*(a+slope0*length*weight0) + 3*(1-t)*t*t*(b-slope1*length*weight1) + t**3*b
    return value(keys[-1])


def compact(frames):
    # Keep the last sample as an explicit duration marker. Remove constant runs.
    result = []
    for index, frame in enumerate(frames):
        if index and index < len(frames)-1:
            values = lambda f: {k: v for k, v in f.items() if k != "time"}
            if values(frame) == values(frames[index-1]) == values(frames[index+1]):
                continue
        result.append(frame)
    return result


def convert_prefab(item, entries, images, height=120, character=False, clips_override=None):
    docs = documents(item["asset"])
    transforms = {key: value for key, (kind, value) in docs.items() if kind == 4}
    roots = [key for key, value in transforms.items() if not value["m_Father"]["fileID"]]
    if len(roots) != 1:
        raise ValueError("Expected one rig root: " + item["name"])
    root = roots[0]
    by_guid = {value["guid"]: value for value in entries.values()}
    nodes, paths = [], {}

    def visit(key, parent=None, path=""):
        transform = transforms[key]
        go = docs[transform["m_GameObject"]["fileID"]][1]
        pos, rot, scale = transform["m_LocalPosition"], transform["m_LocalRotation"], transform["m_LocalScale"]
        angle = math.degrees(math.atan2(2*(rot["w"]*rot["z"]+rot["x"]*rot["y"]), 1-2*(rot["y"]**2+rot["z"]**2)))
        node = dict(name=path or "__root", parent=parent, path=path, x=pos["x"]*100 if parent else 0,
                    y=pos["y"]*100 if parent else 0, rotation=angle, scaleX=scale["x"], scaleY=scale["y"],
                    active=bool(go["m_IsActive"]), components=[docs[c["component"]["fileID"]] for c in go["m_Component"]])
        nodes.append(node); paths[path] = node
        if not parent: paths["__root"] = node
        for child in transform["m_Children"]:
            child_go = docs[transforms[child["fileID"]]["m_GameObject"]["fileID"]][1]
            visit(child["fileID"], node["name"], path + "/" + child_go["m_Name"] if path else child_go["m_Name"])
    visit(root)
    animator_node, animator = next((node,value) for node in nodes for kind, value in node["components"] if kind == 95)
    controller = by_guid[animator["m_Controller"]["guid"]]
    clips = {}
    for kind, state in ([] if clips_override is not None else documents(controller["asset"]).values()):
        if kind != 1102 or not state.get("m_Motion", {}).get("guid"):
            continue
        clip = next(iter(documents(by_guid[state["m_Motion"]["guid"]]["asset"]).values()))[1]
        action = re.split(r"[_ ]", state["m_Name"])[-1].lower()
        action = {"walk": "move", "dead": "die"}.get(action, action)
        if action in clips and not character:
            raise ValueError("Duplicate animation action: " + action)
        clips[action] = clip
    if clips_override is not None:
        clips = copy.deepcopy(clips_override)
    if character:
        clips = {}
        for name, entry in entries.items():
            if "/Common/Animations/" in name and name.endswith(".anim"):
                clip = next(iter(documents(entry["asset"]).values()))[1]
                clips[clip["m_Name"].lower().replace(" ", "_")] = clip
        clips["move"] = clips["walk"]
        clips["die"] = clips["dead1"]
        clips["hit"] = clips["stun"]
    # Animation bindings are relative to the Animator object, which is nested
    # under Character/Rider in Character Maker rather than at the prefab root.
    clips = {action: copy.deepcopy(clip) for action,clip in clips.items()}
    for clip in clips.values():
        for key in ("m_PositionCurves", "m_EulerCurves", "m_ScaleCurves", "m_PPtrCurves", "m_FloatCurves"):
            for curve in clip.get(key, []):
                prefix=animator_node["path"]
                curve["path"] = (prefix+"/"+curve["path"] if curve["path"] else prefix) if prefix else curve["path"]
    # Shared Unity clips also animate optional tails/tools that a particular
    # variant may omit. Empty anchors preserve these harmless animation
    # channels without inventing sprites or changing existing body pieces.
    missing = set(curve["path"] for clip in clips.values() for key in ("m_PositionCurves", "m_EulerCurves", "m_ScaleCurves", "m_PPtrCurves", "m_FloatCurves")
                  for curve in clip.get(key, []) if curve["path"] not in paths)
    def ensure_path(path):
        if path in paths: return
        parent = path.rsplit("/", 1)[0] if "/" in path else ""
        ensure_path(parent)
        node = dict(name=path, path=path, parent=paths[parent]["name"], x=0, y=0, rotation=0,
                    scaleX=1, scaleY=1, active=True, components=[])
        nodes.append(node); paths[path]=node
    for path in sorted(missing): ensure_path(path)
    if not {"idle", "move", "attack", "hit", "die"}.issubset(clips):
        raise ValueError("Missing authored actions in " + item["name"])
    bones = [{"name": "__size", "scaleX": 1, "scaleY": 1}]
    slots, attachments, renderers = [], {}, []
    for node in nodes:
        bone = {key: node[key] for key in ("name", "x", "y", "rotation", "scaleX", "scaleY")}
        bone["parent"] = node["parent"] or "__size"
        bones.append(bone)
        for kind, renderer in node["components"]:
            if kind == 212:
                renderers.append((node, renderer))
    renderers.sort(key=lambda row: row[1]["m_SortingOrder"])

    def visible(node):
        return node["active"] and (not node["parent"] or visible(next(n for n in nodes if n["name"] == node["parent"])))

    for node, renderer in renderers:
        slot = dict(name=node["name"], bone=node["name"])
        guid = renderer.get("m_Sprite", {}).get("guid")
        if guid:
            slot["attachment"] = "u_" + guid
        color = renderer["m_Color"]
        alpha = color["a"] if visible(node) and renderer["m_Enabled"] else 0
        slot["color"] = "".join(format(round(max(0, min(1, color[k] if k != 'a' else alpha))*255), "02x") for k in ("r", "g", "b", "a"))
        slots.append(slot)
        used = {guid} if guid else set()
        for clip in clips.values():
            for curve in clip.get("m_PPtrCurves", []):
                if curve["path"] == node["path"] and curve["attribute"] == "m_Sprite":
                    used.update(k["value"].get("guid") for k in curve["curve"] if k["value"].get("guid"))
        attachments[node["name"]] = {}
        for texture in used:
            info = images[texture]; ratio = 100 / info["ppu"]
            attachments[node["name"]]["u_"+texture] = dict(width=info["width"]*ratio, height=info["height"]*ratio,
                x=(.5-info["pivot"]["x"])*info["width"]*ratio, y=(.5-info["pivot"]["y"])*info["height"]*ratio,
                scaleX=-1 if renderer["m_FlipX"] else 1, scaleY=-1 if renderer["m_FlipY"] else 1)
    animations = {}
    for action, clip in clips.items():
        duration = clip["m_AnimationClipSettings"]["m_StopTime"]
        times = sorted(set([round(i/60, 7) for i in range(math.ceil(duration*60))] + [duration]))
        animation = {"bones": {}, "slots": {}}
        for kind, source, target, fields, factor in [("m_PositionCurves", "value", "translate", ("x", "y"), 100),
                ("m_EulerCurves", "value", "rotate", ("z",), 1), ("m_ScaleCurves", "value", "scale", ("x", "y"), 1)]:
            for curve in clip.get(kind, []):
                node = paths.get(curve["path"])
                if node is None:
                    raise ValueError("Missing animation bone " + curve["path"])
                frames = []
                for time in times:
                    frame = {"time": time}
                    for axis in fields:
                        value = sample(curve["curve"]["m_Curve"], time, axis)*factor
                        if target == "translate": value -= node[axis]
                        elif target == "rotate": value -= node["rotation"]
                        elif target == "scale": value /= node["scale"+axis.upper()] or 1
                        frame["angle" if axis == "z" else axis] = round(value, 5)
                    frames.append(frame)
                animation["bones"].setdefault(node["name"], {})[target] = compact(frames)
        floats = {(curve["path"], curve["attribute"]): curve["curve"]["m_Curve"] for curve in clip.get("m_FloatCurves", [])}
        unsupported = set(key[1] for key in floats) - {"m_IsActive", "m_Enabled", "m_Color.a", "m_Color.r", "m_Color.g", "m_Color.b", "m_LocalPosition.x", "m_LocalPosition.y"}
        # Character Maker's optional MonoBehaviour 'sag' drives its Unity-only
        # gradient helper. Render alpha and all transform animation are baked;
        # Unity script state is deliberately never executed in Cocos.
        if character: unsupported -= {"sag"}
        if unsupported:
            raise ValueError("Unsupported animated properties: " + str(unsupported))
        for node in nodes:
            if not any((node["path"], "m_LocalPosition."+axis) in floats for axis in ("x", "y")):
                continue
            frames=[]
            for index, time in enumerate(times):
                existing=animation["bones"].get(node["name"], {}).get("translate")
                frame=dict(time=time)
                for axis in ("x", "y"):
                    keys=floats.get((node["path"], "m_LocalPosition."+axis))
                    if keys:
                        frame[axis]=round(sample(keys,time)*100-node[axis],5)
                    elif existing:
                        left=next((f for f in reversed(existing) if f['time']<=time),existing[0])
                        right=next((f for f in existing if f['time']>=time),existing[-1])
                        mix=(time-left['time'])/(right['time']-left['time']) if right['time']!=left['time'] else 0
                        frame[axis]=round(left.get(axis,0)+(right.get(axis,0)-left.get(axis,0))*mix,5)
                    else:
                        frame[axis]=0
                frames.append(frame)
            animation["bones"].setdefault(node["name"], {})["translate"]=compact(frames)
        for node, renderer in renderers:
            frames = []
            for time in times:
                alpha = sample(floats[(node["path"], "m_Color.a")], time) if (node["path"], "m_Color.a") in floats else renderer["m_Color"]["a"]
                current = node
                while current:
                    active = sample(floats[(current["path"], "m_IsActive")], time) >= .5 if (current["path"], "m_IsActive") in floats else current["active"]
                    if not active: alpha = 0
                    current = paths.get(current["parent"]) if current["parent"] else None
                enabled=sample(floats[(node["path"], "m_Enabled")],time)>=.5 if (node["path"], "m_Enabled") in floats else renderer["m_Enabled"]
                if not enabled: alpha = 0
                color = "".join(format(round(max(0, min(1, (sample(floats[(node['path'],'m_Color.'+k)],time) if (node['path'],'m_Color.'+k) in floats else renderer["m_Color"][k]) if k != 'a' else alpha))*255), "02x") for k in ("r", "g", "b", "a"))
                frames.append(dict(time=time, color=color))
            animation["slots"].setdefault(node["name"], {})["color"] = compact(frames)
        for curve in clip.get("m_PPtrCurves", []):
            if curve["attribute"] != "m_Sprite":
                raise ValueError("Unsupported object animation: " + curve["attribute"])
            if paths[curve["path"]]["name"] not in {node["name"] for node,renderer in renderers}:
                continue  # Unity ignores sprite bindings absent from this variant.
            animation["slots"].setdefault(paths[curve["path"]]["name"], {})["attachment"] = [dict(time=k["time"], name="u_"+k["value"]["guid"] if k["value"].get("guid") else None) for k in curve["curve"]]
        animations[action] = animation
    result = dict(skeleton={"spine": "3.8.99", "images": "", "audio": ""}, bones=bones, slots=slots,
                  skins=[dict(name="default", attachments=attachments)], animations=animations)
    normalize(result, height)
    return result


def normalize(rig, height):
    matrices, points = {}, []
    for bone in rig["bones"]:
        angle = math.radians(bone.get("rotation", 0))
        a, b = math.cos(angle)*bone.get("scaleX", 1), math.sin(angle)*bone.get("scaleX", 1)
        c, d = -math.sin(angle)*bone.get("scaleY", 1), math.cos(angle)*bone.get("scaleY", 1)
        x, y = bone.get("x", 0), bone.get("y", 0)
        if bone.get("parent"):
            pa,pb,pc,pd,px,py = matrices[bone["parent"]]
            a,b,c,d,x,y = pa*a+pc*b,pb*a+pd*b,pa*c+pc*d,pb*c+pd*d,pa*x+pc*y+px,pb*x+pd*y+py
        matrices[bone["name"]] = a,b,c,d,x,y
    for slot in rig["slots"]:
        if slot.get("color", "ffffffff")[-2:] == "00" or not slot.get("attachment"):
            continue
        item = rig["skins"][0]["attachments"][slot["name"]][slot["attachment"]]
        a,b,c,d,x,y = matrices[slot["bone"]]
        for dx in (-.5, .5):
            for dy in (-.5, .5):
                u,v = item["x"] + dx*item["width"], item["y"] + dy*item["height"]
                points.append((a*u+c*v+x,b*u+d*v+y))
    if not points:
        raise ValueError("No visible base sprites in the imported rig")
    left,right = min(p[0] for p in points),max(p[0] for p in points)
    bottom,top = min(p[1] for p in points),max(p[1] for p in points)
    factor = height/(top-bottom)
    rig["bones"][0].update(scaleX=factor, scaleY=factor, x=-(left+right)/2*factor, y=-bottom*factor)
    rig["skeleton"].update(x=-(right-left)/2*factor, y=0, width=(right-left)*factor, height=height)
