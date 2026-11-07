"""Build read-only catalogs and render authored sprite layouts as AI references."""
import json
import math
import pathlib
import urllib.parse
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent
REFS = ROOT / "references"
FONT = pathlib.Path(r"C:\Windows\Fonts\arial.ttf")
BOLD = pathlib.Path(r"C:\Windows\Fonts\arialbd.ttf")


def font(size, bold=False):
    return ImageFont.truetype(str(BOLD if bold else FONT), size)


def render_current_maps():
    models = json.loads((REFS / "current-map-models.json").read_text())
    for record in models:
        m, images = record["model"], record["images"]
        bounds = m["bounds"]
        zoom = 740 / (bounds["maxX"] - bounds["minX"])
        w, h = 740, round((bounds["maxY"] - bounds["minY"]) * zoom)
        result = Image.new("RGBA", (w, h), "#718c56")
        cache = {}
        for sprite in m["sprites"]:
            node = m["byId"][str(sprite["node"])]
            if not node["active"] or not sprite["enabled"] or sprite["frame"] not in images:
                continue
            # Build slots and placement markers are not environmental artwork.
            if node.get("owner") is not None and m["byId"][str(node["owner"])]["kind"] == "building":
                continue
            meta = images[sprite["frame"]]
            if sprite["frame"] not in cache:
                file = urllib.parse.unquote(urllib.parse.urlparse(meta["url"]).path).lstrip("/")
                with Image.open(file) as source:
                    sw, sh = (meta["height"], meta["width"]) if meta["rotated"] else (meta["width"], meta["height"])
                    patch = source.convert("RGBA").crop((meta["x"], meta["y"], meta["x"] + sw, meta["y"] + sh))
                    if meta["rotated"]:
                        patch = patch.transpose(Image.Transpose.ROTATE_90)
                    cache[sprite["frame"]] = patch
            patch = cache[sprite["frame"]]
            nw, nh = node["width"] or patch.width, node["height"] or patch.height
            a, b, c, d, tx, ty = node["world"]
            ax, ay = node["anchor"]["x"], node["anchor"]["y"]
            u, v = zoom * a * nw / patch.width, -zoom * c * nh / patch.height
            s, t = -zoom * b * nw / patch.width, zoom * d * nh / patch.height
            ox = zoom * (tx - bounds["minX"] - a * ax * nw + c * (1 - ay) * nh)
            oy = zoom * (bounds["maxY"] - ty + b * ax * nw - d * (1 - ay) * nh)
            det = u * t - v * s
            if abs(det) < 1e-9:
                continue
            corners = [(u * x + v * y + ox, s * x + t * y + oy) for x, y in [(0, 0), (patch.width, 0), (0, patch.height), patch.size]]
            x0, y0 = max(0, math.floor(min(p[0] for p in corners))), max(0, math.floor(min(p[1] for p in corners)))
            x1, y1 = min(w, math.ceil(max(p[0] for p in corners))), min(h, math.ceil(max(p[1] for p in corners)))
            if x1 <= x0 or y1 <= y0:
                continue
            matrix = (t / det, -v / det, (t * (x0 - ox) - v * (y0 - oy)) / det,
                      -s / det, u / det, (-s * (x0 - ox) + u * (y0 - oy)) / det)
            target = patch.transform((x1 - x0, y1 - y0), Image.Transform.AFFINE, matrix, Image.Resampling.BICUBIC)
            opacity = node["source"].get("_opacity", 255)
            if opacity != 255:
                target.putalpha(target.getchannel("A").point(lambda p: p * opacity // 255))
            result.alpha_composite(target, (x0, y0))
        result.convert("RGB").save(REFS / f"current-{record['id'].lower()}.png")
    board = Image.new("RGB", (1600, 750), "#18212b")
    draw = ImageDraw.Draw(board)
    draw.text((24, 14), "CURRENT FOUR MAPS | STYLE + PLAYABLE SPACE REFERENCE", font=font(23, True), fill="white")
    for i, record in enumerate(models):
        with Image.open(REFS / f"current-{record['id'].lower()}.png") as picture:
            picture.thumbnail((380, 665), Image.Resampling.LANCZOS)
            x = i * 400 + (400 - picture.width) // 2
            board.paste(picture, (x, 65))
            draw.text((i * 400 + 20, 42), record["id"], font=font(18), fill="white")
    board.save(REFS / "current-four-maps.png")


def biome_boards():
    manifest = json.loads((ROOT / "source-manifest.json").read_text())
    by_guid = {r["guid"]: r for r in manifest["assets"]}
    for biome in manifest["biomes"]:
        assets = [by_guid[g] for g in biome["sprites"]]
        # All referenced sprites are shown; no added or repainted art.
        columns, cw, ch = 8, 200, 170
        rows = math.ceil(len(assets) / columns)
        board = Image.new("RGB", (1600, rows * ch + 92), "#e5e9e8")
        draw = ImageDraw.Draw(board)
        draw.rectangle((0, 0, 1600, 85), fill="#23303e")
        draw.text((24, 14), biome["name"] + " | EXTRACTED SOURCE SPRITES ONLY", font=font(29, True), fill="white")
        draw.text((24, 51), "Reuse these exact visual families. Labels are catalog names, not map content.", font=font(20), fill="#c9e5f5")
        for i, record in enumerate(assets):
            x, y = (i % columns) * cw, 92 + (i // columns) * ch
            draw.rectangle((x + 3, y + 3, x + cw - 3, y + ch - 3), fill="#f5f5ef", outline="#c2c8c9")
            with Image.open(record["file"]) as source:
                image = source.convert("RGBA")
                box = image.getbbox()
                if box:
                    image = image.crop(box)
                image.thumbnail((cw - 18, ch - 38), Image.Resampling.LANCZOS)
                board.paste(image, (x + (cw - image.width) // 2, y + (ch - 34 - image.height) // 2), image)
            name = pathlib.Path(record["file"]).stem
            draw.text((x + 7, y + ch - 28), name, font=font(12), fill="#18212b")
        board.save(REFS / (biome["id"] + "-source-board.png"))
        (REFS / (biome["id"] + "-assets.json")).write_text(json.dumps(assets, indent=2) + "\n")
        print(biome["name"], len(assets), board.size)


if __name__ == "__main__":
    REFS.mkdir(parents=True, exist_ok=True)
    render_current_maps()
    biome_boards()
