"""Derive stationary, forward-playing flight loops from Spine Projectiles 1.

The source animation objects remain untouched. Each animated property retains
its own authored 30 Hz cadence; complete property cycles are tiled to a common
period rather than truncating one layer to another layer's last keyframe. For
incommensurate exported periods, a bounded common clock minimizes cadence
changes instead of expanding a flight animation into several minutes.
"""
from copy import deepcopy
from functools import reduce
from math import gcd
import re
import struct

FPS = 30
PREFIX = "flight_loop_"
EXCLUDED = {"fly_901"}


def _f32(value):
    # Spine stores timeline keys in Float32Array. Use the same duration in the
    # descriptor and closing keys, so exact end samples reach the final pose.
    return struct.unpack("f", struct.pack("f", value))[0]


def _frame(key):
    return round(float(key.get("time", 0)) * FPS)


def _value(kind, key):
    if kind == "attachment":
        return key.get("name")
    if kind == "color":
        return tuple(int(key.get("color", "ffffffff")[i:i + 2], 16)
                     for i in range(0, 8, 2))
    if kind == "rotate":
        return (float(key.get("angle", 0)),)
    default = 1 if kind == "scale" else 0
    return (float(key.get("x", default)), float(key.get("y", default)))


def _equal(kind, a, b):
    if kind == "attachment":
        return a == b
    if kind == "rotate":
        delta = (a[0] - b[0] + 180) % 360 - 180
        return abs(delta) < 0.00001
    return all(abs(x - y) < 0.00001 for x, y in zip(a, b))


def _constant(key):
    result = deepcopy(key)
    result.pop("time", None)
    result.pop("curve", None)
    return [result]


def _continuous_cycle(kind, keys, label, changes):
    """Return one complete authored cycle, keeping its absolute phase."""
    values = [_value(kind, key) for key in keys]
    constant = all(_equal(kind, values[0], value) for value in values[1:])
    if kind == "rotate":
        constant = all(abs(values[0][0] - value[0]) < .00001 for value in values[1:])
    if constant:
        return _constant(keys[0]), 0
    candidates = []
    for first in range(len(keys)):
        for last in range(first + 1, len(keys)):
            period = _frame(keys[last]) - _frame(keys[first])
            if period < 2 or not _equal(kind, values[first], values[last]):
                continue
            full_turn = kind == "rotate" and abs(values[last][0] - values[first][0]) >= 359.99999
            if not full_turn and not any(not _equal(kind, values[first], value)
                                        for value in values[first + 1:last]):
                continue
            candidates.append((period, _frame(keys[first]), first, last))
    if candidates:
        period, _, first, last = min(candidates)
        selected = deepcopy(keys[first:last + 1])
        if first or last != len(keys) - 1:
            changes.append({"track": label, "operation": "steady-cycle",
                            "sourceStart": _frame(keys[first]) / FPS,
                            "sourceEnd": _frame(keys[last]) / FPS})
        return selected, period
    # These exports contain entrance-only settling/color ramps. Their final
    # authored value is the sustained flight appearance, not a reverse ramp.
    if len(keys) == 2:
        changes.append({"track": label, "operation": "settled-value",
                        "sourceTime": _frame(keys[-1]) / FPS})
        return _constant(keys[-1]), 0
    raise ValueError("No authored periodic or settling cycle: " + label)


def _attachment_cycle(keys, label, changes):
    values = [_value("attachment", key) for key in keys]
    if all(value == values[0] for value in values):
        return _constant(keys[0]), 0
    # A repeated first image is an explicit cycle closure. Otherwise keep the
    # final atlas cell for its ordinary frame interval before wrapping.
    first_frame = _frame(keys[0])
    repeats = [index for index in range(1, len(keys))
               if values[index] == values[0] and
               any(value != values[0] for value in values[1:index])]
    if repeats:
        end = repeats[0]
        return deepcopy(keys[:end + 1]), _frame(keys[end]) - first_frame
    gaps = [_frame(right) - _frame(left)
            for left, right in zip(keys, keys[1:])
            if _frame(right) > _frame(left)]
    cadence = min(gaps) if gaps else 1
    period = _frame(keys[-1]) - first_frame + cadence
    closing = deepcopy(keys[0])
    closing["time"] = (first_frame + period) / FPS
    changes.append({"track": label, "operation": "complete-frame-cycle",
                    "framePeriod": period})
    return deepcopy(keys) + [closing], period


def _phase_zero(kind, keys, period):
    start = _frame(keys[0])
    source_frame = start + ((-start) % period)
    for left, right in zip(keys, keys[1:]):
        lf, rf = _frame(left), _frame(right)
        if lf <= source_frame <= rf:
            if kind == "attachment" or left.get("curve") == "stepped":
                return deepcopy(left)
            alpha = (source_frame - lf) / max(1, rf - lf)
            a, b = _value(kind, left), _value(kind, right)
            values = [x + (y - x) * alpha for x, y in zip(a, b)]
            if kind == "color":
                return {"color": "".join(format(round(value), "02x") for value in values)}
            if kind == "rotate":
                return {"angle": values[0]}
            return {"x": values[0], "y": values[1]}
    raise ValueError("No zero-phase segment in source cycle")


def _tile(kind, keys, period, frames):
    if not period:
        return _constant(keys[0])
    repeats = max(1, round(frames / period))
    target_period = frames / repeats
    by_frame = {}
    # Drop the duplicate closing key; the next cycle supplies that same pose.
    for key in keys[:-1]:
        phase = _frame(key) % period
        value = deepcopy(key)
        value.pop("time", None)
        by_frame[phase] = value
    if 0 not in by_frame:
        # Every source continuous cycle has an authored phase-zero key. A
        # discrete cycle may start after zero; carry its preceding image.
        by_frame[0] = (_phase_zero(kind, keys, period) if kind != "attachment"
                       else deepcopy(by_frame[max(by_frame)]))
        by_frame[0].pop("time", None)
    result = []
    for repeat in range(repeats):
        for phase, value in sorted(by_frame.items()):
            key = deepcopy(value)
            time = (repeat + phase / period) * target_period / FPS
            if time:
                key["time"] = time
            result.append(key)
    closing = deepcopy(result[0])
    closing["time"] = _f32(frames / FPS)
    closing.pop("curve", None)
    if kind == "rotate":
        # Retain complete turns, so 360-degree source rotations continue in
        # their authored direction instead of rotating backward at the seam.
        turns = round((_value(kind, keys[-1])[0] -
                       _value(kind, keys[0])[0]) / 360)
        if turns:
            for key in result:
                cycle = int(round(key.get("time", 0) * FPS / target_period * 1e8) / 1e8)
                key["angle"] = float(key.get("angle", 0)) + turns * 360 * cycle
            closing["angle"] = float(result[0].get("angle", 0)) + turns * 360 * repeats
    result.append(closing)
    return result


def _stationary_master(animation, name, changes):
    masters = {"fly_25": ["bone2"], "fly_55": ["bone2"],
               "fly_63": ["1022"], "fly_44": ["sdj", "sdj2"]}
    for bone in masters.get(name, []):
        tracks = animation["bones"][bone]
        for kind in ("translate", "scale"):
            keys = tracks[kind]
            # Keep the stable full-sized authored flight pose between entry
            # growth and departure, leaving all descendant pulses untouched.
            key = keys[0] if kind == "translate" else keys[1]
            tracks[kind] = _constant(key)
            changes.append({"track": "bones." + bone + "." + kind,
                            "operation": "stationary-flight-pose",
                            "sourceTime": _frame(key) / FPS})
    if name == "fly_39":
        animation["bones"]["hywq2"]["rotate"][-1]["angle"] = -360
        changes.append({"track": "bones.hywq2.rotate",
                        "operation": "close-rounded-full-turn",
                        "sourceAngle": -359.29, "angle": -360})


def prepare_skeleton(data, skeleton_id):
    """Return a copy with derived loops and per-clip publication metadata."""
    result, clips = deepcopy(data), []
    for name, original in data.get("animations", {}).items():
        if name in EXCLUDED or name.startswith(PREFIX):
            continue
        if not re.fullmatch(r"fly_\d+", name):
            raise ValueError("Unexpected projectile animation: " + name)
        animation, changes, cycles = deepcopy(original), [], []
        root = result["bones"][0]["name"]
        if original.get("bones", {}).get(root, {}).get("translate"):
            raise ValueError("Source root translation needs explicit normalization")
        source_duration = max((float(key.get("time", 0))
                               for group in (original.get("bones", {}), original.get("slots", {}))
                               for tracks in group.values()
                               for keys in tracks.values() for key in keys), default=0)
        _stationary_master(animation, name, changes)
        tracks = []
        for group in ("bones", "slots"):
            for target, properties in animation.get(group, {}).items():
                for kind, keys in properties.items():
                    label = group + "." + target + "." + kind
                    if any(key.get("curve") not in (None, "stepped") for key in keys):
                        raise ValueError("Unsupported curve in projectile timeline: " + label)
                    if kind not in ("attachment", "color", "translate", "scale", "rotate", "shear"):
                        raise ValueError("Unsupported projectile timeline: " + label)
                    selected, period = (_attachment_cycle(keys, label, changes)
                                        if kind == "attachment" else
                                        _continuous_cycle(kind, keys, label, changes))
                    tracks.append((properties, kind, selected, period))
                    if period:
                        cycles.append({"track": label, "frames": period,
                                       "sourceStart": _frame(selected[0]) / FPS,
                                       "sourceEnd": _frame(selected[-1]) / FPS})
        periods = [row["frames"] for row in cycles]
        frames = reduce(lambda a, b: a * b // gcd(a, b), periods, 1) if periods else FPS
        exact_frames = frames
        if frames > 240:
            # Find the common period whose integer repeats alter each layer's
            # authored cadence least. Prefer shorter clocks on an exact tie.
            def error(candidate):
                changes = [abs(candidate / max(1, round(candidate / period)) / period - 1)
                           for period in set(periods)]
                return max(changes), sum(changes), candidate
            frames = min(range(max(periods), 241), key=error)
            if error(frames)[0] > .11:
                raise ValueError("Cannot phase-close without excessive retiming: " + name)
        for cycle in cycles:
            repeats = max(1, round(frames / cycle["frames"]))
            cycle["repeats"] = repeats
            cycle["playbackScale"] = cycle["frames"] * repeats / frames
        for properties, kind, selected, period in tracks:
            properties[kind] = _tile(kind, selected, period, frames)
        # The only changing draw order is a terminal cleanup key in fly_24.
        # Its sustained flight ordering is the initial authored ordering.
        if animation.get("drawOrder"):
            if len(animation["drawOrder"]) > 1:
                changes.append({"track": "drawOrder", "operation": "flight-order"})
            animation["drawOrder"] = _constant(animation["drawOrder"][0])
        else:
            animation["drawOrder"] = [{}]
        # Native pool reuse can keep the same SkeletonData while switching to
        # another projectile variant. Explicit setup keys prevent pose/slot
        # residue from that previous variant without depending on a renderer
        # resetting the skeleton for us.
        for bone in data["bones"]:
            bone_tracks = animation.setdefault("bones", {}).setdefault(bone["name"], {})
            for kind in ("translate", "rotate", "scale", "shear"):
                bone_tracks.setdefault(kind, [{}])
        for slot in data["slots"]:
            slot_tracks = animation.setdefault("slots", {}).setdefault(slot["name"], {})
            slot_tracks.setdefault("attachment", [{"name": slot.get("attachment")}])
            slot_tracks.setdefault("color", [{"color": slot.get("color", "ffffffff")}])
        if result["bones"][0].get("parent"):
            raise ValueError("Expected a single root bone")
        root_tracks = animation.setdefault("bones", {}).setdefault(root, {})
        duration = _f32(frames / FPS)
        root_tracks["translate"] = [{}, {"time": duration}]
        loop_name = PREFIX + name
        result["animations"][loop_name] = animation
        clips.append({"sourceAnimation": name, "animation": loop_name,
                      "duration": duration, "sourceDuration": source_duration,
                      "loopFrames": frames, "fps": FPS, "static": not bool(periods),
                      "exactCommonFrames": exact_frames, "setupPose": True,
                      "normalizations": changes, "trackCycles": cycles,
                      "skeleton": skeleton_id})
    return result, clips


def center_skeleton(data, clips, bounds_by_animation):
    """Center complete-loop envelopes through the derived root tracks only.

    bounds_by_animation maps loop names to {x,y,width,height}; x/y are the
    unrotated lower-left envelope in the original skeleton's coordinate space.
    Source animations and source attachment/bone data are never changed.
    """
    result = deepcopy(data)
    root = result["bones"][0]["name"]
    for clip in clips:
        bounds = bounds_by_animation[clip["animation"]]
        cx, cy = bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2
        result["animations"][clip["animation"]]["bones"][root]["translate"] = [
            {"x": -cx, "y": -cy}, {"time": clip["duration"], "x": -cx, "y": -cy}]
    return result
