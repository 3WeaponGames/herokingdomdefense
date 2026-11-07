"""Retain prior versions outside the selected biome folders without overwriting."""
import hashlib
import json
import os
import pathlib
import uuid

ROOT = pathlib.Path(__file__).resolve().parent
file = ROOT / "concept-jobs.json"
before = file.read_bytes()
jobs = json.loads(before)
for job in jobs:
    for number, version in enumerate(job.get("previousVersions", []), 1):
        source = (ROOT / version["file"]).resolve()
        target = (ROOT / "references" / "drafts" / f"{job['id']}-prior-{number}.png").resolve()
        if not source.is_relative_to(ROOT) or not target.is_relative_to(ROOT / "references" / "drafts"):
            raise ValueError("Draft archive path escaped the deliverable")
        if source == target:
            continue
        if hashlib.sha256(source.read_bytes()).hexdigest() != version["sha256"]:
            raise RuntimeError("Concurrent concept edit: " + str(source))
        if target.exists():
            raise RuntimeError("Refusing to overwrite archived draft: " + str(target))
        target.parent.mkdir(parents=True, exist_ok=True)
        source.rename(target)
        version["file"] = target.relative_to(ROOT).as_posix()
        print("Archived", job["id"], "prior version")
if file.read_bytes() != before:
    raise RuntimeError("Concurrent manifest edit; archived PNGs retained without overwriting metadata")
temporary = file.with_name("concept-jobs." + uuid.uuid4().hex + ".tmp")
temporary.write_text(json.dumps(jobs, indent=2) + "\n")
os.replace(temporary, file)
