"""Validate the delivered images and build a self-contained comparison gallery."""
import collections
import hashlib
import html
import json
import pathlib
import zipfile
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent
FONT = r"C:\Windows\Fonts\arial.ttf"
BOLD = r"C:\Windows\Fonts\arialbd.ttf"
jobs = json.loads((ROOT / "concept-jobs.json").read_text())
assert len(jobs) == 40 and all(j["status"] == "generated" for j in jobs), "Forty completed concepts are required"
assert all(v == 5 for v in collections.Counter(j["biome"] for j in jobs).values())
assert len({j["sha256"] for j in jobs}) == 40, "Duplicate concept image"
for job in jobs:
    file = ROOT / job["file"]
    assert hashlib.sha256(file.read_bytes()).hexdigest() == job["sha256"]
    with Image.open(file) as image:
        assert image.width == 1024 and image.height == 1536, (job["id"], image.size)
        image.verify()

def contact(entries, columns, cell_width, cell_height, title, file):
    rows = (len(entries) + columns - 1) // columns
    result = Image.new("RGB", (columns * cell_width, rows * cell_height + 56), "#17222e")
    draw = ImageDraw.Draw(result)
    draw.text((18, 14), title, font=ImageFont.truetype(BOLD, 24), fill="white")
    for i, job in enumerate(entries):
        x, y = (i % columns) * cell_width, 56 + (i // columns) * cell_height
        with Image.open(ROOT / job["file"]) as image:
            image.thumbnail((cell_width - 12, cell_height - 55), Image.Resampling.LANCZOS)
            result.paste(image, (x + (cell_width - image.width) // 2, y))
        draw.text((x + 9, y + cell_height - 49), job["biomeName"] + " " + str(job["number"]), font=ImageFont.truetype(BOLD, 16), fill="white")
        draw.text((x + 9, y + cell_height - 27), job["title"], font=ImageFont.truetype(FONT, 14), fill="#c0d4e4")
    result.save(ROOT / file, quality=91)

for biome in dict.fromkeys(j["biome"] for j in jobs):
    entries = [j for j in jobs if j["biome"] == biome]
    contact(entries, 5, 210, 350, entries[0]["biomeName"] + " | Five layout concepts", biome + "/contact-sheet.jpg")
contact(jobs, 5, 210, 350, "40 BIOME CONCEPTS | Five variants per biome", "all-40-overview.jpg")
contact([j for j in jobs if j["number"] == 1], 4, 300, 480, "EIGHT BIOMES | First concept from each set", "eight-biomes-overview.jpg")

cards = []
for index, job in enumerate(jobs):
    cards.append('<article class="card" data-biome="' + job["biome"] + '"><button class="art" data-index="' + str(index) + '"><img loading="lazy" src="' + job["file"] + '" alt="' + html.escape(job["biomeName"] + ' ' + job["title"]) + '"></button><div class="caption"><small>' + html.escape(job["biomeName"]) + ' · ' + str(job["number"]) + ' / 5</small><h2>' + html.escape(job["title"]) + '</h2><a href="' + job["file"] + '">Full PNG</a> · <a href="references/' + job["biome"] + '-source-board.png">Source sprites</a></div></article>')
biomes = list(dict.fromkeys(j["biome"] for j in jobs))
filters = '<button data-filter="all" aria-pressed="true">All 40</button>' + ''.join('<button data-filter="' + b + '" aria-pressed="false">' + html.escape(next(j["biomeName"] for j in jobs if j["biome"] == b)) + '</button>' for b in biomes)
page = r'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hero Kingdom Defense · 40 Biome Concepts</title>
<style>
:root{font-family:system-ui,sans-serif;color:#edf4fc;background:#101924;color-scheme:dark}*{box-sizing:border-box}body{margin:0}header,main,footer{max-width:1520px;margin:auto;padding:28px}header{padding-bottom:10px}h1{font-size:clamp(28px,4vw,46px);margin:0 0 10px}p{line-height:1.6;color:#bdd0e2;max-width:1000px}a{color:#8dd9fd}nav{display:flex;gap:9px;flex-wrap:wrap;margin:22px 0}button{font:inherit;cursor:pointer;color:inherit;background:#24364a;border:1px solid #47627e;border-radius:9px;padding:10px 14px}nav button[aria-pressed=true]{background:#acd87f;color:#10231a;border-color:#c9efaa}.notice{padding:14px 18px;background:#1e2c3c;border-left:4px solid #acd87f;border-radius:6px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:18px}.card{background:#1c2a3b;border:1px solid #354c66;border-radius:12px;overflow:hidden}.card[hidden]{display:none}.art{border:0;padding:0;display:block;width:100%;border-radius:0;background:#0a121d}.art img{display:block;width:100%;aspect-ratio:2/3;object-fit:contain}.caption{padding:14px}.caption small{color:#acc8dd}.caption h2{font-size:19px;margin:6px 0 12px}.caption a{font-size:14px}dialog{padding:16px;border:1px solid #6c88a5;background:#172536;color:white;width:min(1200px,96vw);max-height:96vh;border-radius:12px}dialog::backdrop{background:#02060deb}.viewer{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:18px}dialog img{width:100%;height:82vh;object-fit:contain}.viewer h2{margin-top:0}.controls{display:flex;gap:7px;flex-wrap:wrap}.viewer p{font-size:14px}footer{color:#9fb5c9;padding-top:0}#count{font-size:14px;color:#a9c4da}@media(max-width:700px){header,main,footer{padding:18px}.viewer{grid-template-columns:1fr}dialog img{height:60vh}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.caption{padding:10px}.caption h2{font-size:16px}}
</style><header><h1>Eight biomes. Forty layouts.</h1><p>Hero Kingdom Defense environment studies · five different concepts for each authored biome in the two 2D Minimal Environment packs.</p><p class="notice">OpenAI imagegen concepts using each biome's extracted source sprites and the four original maps as references. These are visual layout studies; production maps should be assembled with the actual sprites and exported with ground points, collision data and depth cutouts.</p><p><a href="eight-biomes-overview.jpg">Eight-biome overview</a> · <a href="all-40-overview.jpg">All forty at a glance</a> · <a href="PRODUCTION-PLAN.txt">Production and performance plan</a> · <a href="prompts.txt">Prompts</a> · <a href="source-manifest.json">Asset provenance</a> · <a href="biome-concepts-40.zip">Download package</a></p><nav>__FILTERS__</nav><div id="count">Showing 40 concepts</div></header><main class="grid">__CARDS__</main><footer>1024 × 1536 PNGs · Built-in OpenAI image_gen · Current game maps and player progress unchanged.</footer><dialog><div class="viewer"><img id="view" alt=""><aside><h2 id="title"></h2><p id="biome"></p><div class="controls"><button id="previous">← Previous</button><button id="next">Next →</button><button id="close">Close</button></div><p><a id="full">Open full PNG</a></p><p id="terrain"></p><p>Source sprites, silhouettes, collision and exact depth behavior must be retained when reconstructing this layout in the editor.</p></aside></div></dialog>
<script>const jobs=__DATA__;const dialog=document.querySelector('dialog');let selected=0,filter='all';const visible=()=>jobs.map((j,i)=>({j,i})).filter(o=>filter==='all'||o.j.biome===filter).map(o=>o.i);function show(index){selected=index;const j=jobs[index];document.querySelector('#view').src=j.file;document.querySelector('#view').alt=j.biomeName+' '+j.title;document.querySelector('#title').textContent=j.title;document.querySelector('#biome').textContent=j.biomeName+' · Concept '+j.number+' / 5';document.querySelector('#full').href=j.file;document.querySelector('#terrain').textContent='Allowed terrain additions: '+j.allowedTerrainAdditions;if(!dialog.open)dialog.showModal();}function step(n){const list=visible(),i=list.indexOf(selected);show(list[(i+n+list.length)%list.length]);}document.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>show(+b.dataset.index));document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',x===b));document.querySelectorAll('.card').forEach(c=>c.hidden=filter!=='all'&&c.dataset.biome!==filter);document.querySelector('#count').textContent='Showing '+visible().length+' concepts';});document.querySelector('#close').onclick=()=>dialog.close();document.querySelector('#previous').onclick=()=>step(-1);document.querySelector('#next').onclick=()=>step(1);document.addEventListener('keydown',e=>{if(dialog.open&&e.key==='ArrowRight')step(1);if(dialog.open&&e.key==='ArrowLeft')step(-1);});</script></html>'''
data = [{k: j[k] for k in ["id", "biome", "biomeName", "number", "title", "file", "allowedTerrainAdditions"]} for j in jobs]
page = page.replace('__FILTERS__', filters).replace('__CARDS__', ''.join(cards)).replace('__DATA__', json.dumps(data).replace('</', '<\\/'))
(ROOT / "index.html").write_text(page, encoding="utf-8")
manifest = json.loads((ROOT / "source-manifest.json").read_text())
for asset in manifest["assets"]:
    assert hashlib.sha256(pathlib.Path(asset["file"]).read_bytes()).hexdigest() == asset["sha256"], asset["unityPath"]
report = {"concepts": 40, "biomes": 8, "perBiome": dict(collections.Counter(j["biome"] for j in jobs)), "imageSize": [1024, 1536], "uniqueImageHashes": 40, "extractedAssetsVerified": len(manifest["assets"]), "runtimeFilesChanged": False, "navigationOrGameplayCertification": False, "generator": "OpenAI built-in image_gen", "review": "Visual concepts; exact source-sprite assembly, collision and navigation checks follow selection."}
(ROOT / "validation.json").write_text(json.dumps(report, indent=2) + "\n")
files = [file for file in ROOT.rglob('*') if file.is_file() and file.suffix.lower() in ['.png','.jpg','.html','.txt','.json','.py']]
with zipfile.ZipFile(ROOT / "biome-concepts-40.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        archive.write(file, file.relative_to(ROOT))
print(json.dumps(report, indent=2))
print('Gallery:', ROOT / 'index.html')
