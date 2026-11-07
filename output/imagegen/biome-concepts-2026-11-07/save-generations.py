"""Copy completed built-in imagegen outputs into this deliverable, preserving originals."""
import hashlib
import json
import os
import pathlib
import shutil
import sys
import uuid
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent
jobs_path = ROOT / "concept-jobs.json"
before = jobs_path.read_bytes()
jobs = json.loads(before)
by_id = {job["id"]: job for job in jobs}
for record in json.load(sys.stdin):
    job = by_id[record["id"]]
    source = pathlib.Path(record["source"]).resolve()
    generated_root = pathlib.Path.home() / ".codex" / "generated_images"
    if not source.is_relative_to(generated_root.resolve()):
        raise ValueError("Unexpected imagegen source location")
    final_file = record.get("newFile", job["file"])
    target = (ROOT / final_file).resolve()
    if not target.is_relative_to(ROOT):
        raise ValueError("Image path escaped deliverable folder")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != digest:
        raise RuntimeError(f"Refusing to overwrite different concept: {target}")
    if not target.exists():
        shutil.copy2(source, target)
    with Image.open(target) as image:
        image.verify()
    with Image.open(target) as image:
        job.update(width=image.width, height=image.height)
    if final_file != job["file"]:
        job.setdefault("previousVersions", []).append({key: job[key] for key in ["file", "sha256", "generatedSource"]})
        job["file"] = final_file
    job.update(status="generated", sha256=digest, generatedSource=str(source), generator="OpenAI built-in image_gen")
    if record.get("revisionPrompt"):
        job["revisionPrompt"] = record["revisionPrompt"]
    if record.get("revisionReferences"):
        job["revisionReferences"] = record["revisionReferences"]
    print(job["id"], job["width"], job["height"], "saved")
if jobs_path.read_bytes() != before:
    raise RuntimeError("Concurrent concept-manifest edit; generated PNGs retained, manifest not overwritten")
temporary = jobs_path.with_name("concept-jobs." + uuid.uuid4().hex + ".tmp")
temporary.write_text(json.dumps(jobs, indent=2) + "\n", encoding="utf-8")
if jobs_path.read_bytes() != before:
    temporary.unlink()
    raise RuntimeError("Concurrent manifest change before final replacement")
os.replace(temporary, jobs_path)
print("Complete:", sum(j["status"] == "generated" for j in jobs), "/", len(jobs))
