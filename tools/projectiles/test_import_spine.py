"""Publication regressions: python -m unittest discover -s tools/projectiles -p test_import_spine.py."""
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("import_spine", Path(__file__).with_name("import-spine.py"))
IMPORTER = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(IMPORTER)


def image_bytes(alpha=255):
    stream = io.BytesIO(); Image.new("RGBA", (8, 8), (230, 170, 80, alpha)).save(stream, format="PNG"); return stream.getvalue()


def fake_loops(data, skeleton):
    result = copy.deepcopy(data); rows = []
    for name in data["animations"]:
        if name == "fly_901": continue
        animation = "flight_loop_" + name
        result["animations"][animation] = {"bones": {"root": {"rotate": [{"angle": 0}, {"time": 1, "angle": 0}]}}}
        rows.append(dict(sourceAnimation=name, animation=animation, duration=1, sourceDuration=.5, static=False, fps=30, loopFrames=30))
    return result, rows


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="hkd-spine-import-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.project, self.source, self.staging = (self.base / item for item in ("project", "source", "staging"))
        self.project.mkdir(); ready=[]
        for index in range(1, 7):
            skeleton = "fly" + str(index)
            directory = self.source / "Effects" / skeleton; directory.mkdir(parents=True)
            numbers = range(1, 63) if index == 1 else [61 + index]
            animations = {"fly_" + str(number): {"slots": {"item": {"attachment": [{"name": "item"}]}}} for number in numbers}
            if index == 1: animations["fly_901"] = {"slots": {"item": {"attachment": [{"time": .5, "name": None}]}}}
            data=dict(skeleton={"spine": "3.8.99"}, bones=[{"name": "root"}], slots=[], skins=[], animations=animations)
            (directory / (skeleton + ".json")).write_text(json.dumps(data))
            (directory / (skeleton + ".atlas.txt")).write_text(skeleton + ".png\nsize: 8,8\nformat: RGBA8888\n")
            (directory / (skeleton + ".png")).write_bytes(image_bytes())
            ready.extend(dict(skeleton=skeleton, animation=name) for name in animations if name != "fly_901")
        (self.source / "source-manifest.json").write_text(json.dumps({"ready_clips": ready}))
        self.catalog = self.project / IMPORTER.CATALOG; self.catalog.parent.mkdir(parents=True)
        self.before = ('{\n  "source": {"legacy": "preserve this whitespace"},\n  "assets": [{"id":"old", "custom":7}],\n'
                       '  "sets": [{"id":"old", "flight":"old"}],\n  "assignments": {"hero": "old"},\n'
                       '  "heroArrowTiers": [{"levels":[1,2],"skin":"custom"}],\n  "future": {"retain":true}\n}\n').encode()
        self.catalog.write_bytes(self.before)

    def prepare(self):
        return IMPORTER.prepare(self.source, self.staging, self.project, fake_loops)

    def bake(self):
        file = self.staging / IMPORTER.LIBRARY; library = json.loads(file.read_text())
        for asset in library["assets"]:
            raw=image_bytes(); thumbnail=self.staging / asset["thumbnail"]; thumbnail.parent.mkdir(parents=True, exist_ok=True); thumbnail.write_bytes(raw)
            asset.update(width=16, height=8, previewBounds=dict(minX=-8,minY=-4,maxX=8,maxY=4,width=16,height=8), thumbnailTime=.25, thumbnailSha256=hashlib.sha256(raw).hexdigest())
        file.write_text(json.dumps(library)); return library

    def test_prepare_is_external_preserves_sources_and_uses_six_shared_stable_resources(self):
        original={p: p.read_bytes() for p in self.source.rglob("*") if p.is_file()}
        report=self.prepare(); library=json.loads((self.staging / IMPORTER.LIBRARY).read_text())
        self.assertEqual(report["assets"],67); self.assertEqual(len({a["uuid"] for a in library["assets"]}),6)
        self.assertEqual(self.catalog.read_bytes(),self.before)
        for file, raw in original.items(): self.assertEqual(file.read_bytes(),raw)
        for i in range(1,7):
            source=json.loads((self.source / ("Effects/fly{0}/fly{0}.json".format(i))).read_text())
            staged=json.loads((self.staging / (IMPORTER.BASE + "/fly{0}/fly{0}.json".format(i))).read_text())
            for key,value in source["animations"].items(): self.assertEqual(staged["animations"][key],value)
        with self.assertRaises(ValueError): self.prepare()

    def test_publication_is_atomic_append_only_and_reimport_is_no_write(self):
        self.prepare(); assets=self.bake()["assets"]
        dry=IMPORTER.publish(self.staging,self.project,self.base/"backups",True)
        self.assertTrue(dry["dryRun"]); self.assertEqual(self.catalog.read_bytes(),self.before)
        result=IMPORTER.publish(self.staging,self.project,self.base/"backups")
        self.assertTrue(result["backup"]); data=json.loads(self.catalog.read_bytes())
        old=json.loads(self.before)
        for key in ("assignments","heroArrowTiers","future"): self.assertEqual(data[key],old[key])
        self.assertEqual(data["assets"][0],old["assets"][0]); self.assertEqual(data["sets"][0],old["sets"][0])
        self.assertIn(b'{"id":"old", "custom":7}',self.catalog.read_bytes()); self.assertIn(b'"source": {"legacy": "preserve this whitespace"',self.catalog.read_bytes())
        self.assertEqual(len(data["assets"]),68); self.assertEqual(len(data["sets"]),68)
        self.assertEqual(data["source"]["spineProjectiles"],json.loads((self.staging/IMPORTER.LIBRARY).read_text())["source"])
        second=IMPORTER.publish(self.staging,self.project,self.base/"backups")
        self.assertEqual(second["files"],{}); self.assertIsNone(second["backup"])
        self.assertEqual(assets,data["assets"][1:])

    def test_rejects_partial_or_invalid_thumbnails_and_changed_runtime_inputs(self):
        self.prepare(); self.bake(); libraryfile=self.staging/IMPORTER.LIBRARY; library=json.loads(libraryfile.read_text())
        first=library["assets"][0]; thumbnail=self.staging/first["thumbnail"]; original=thumbnail.read_bytes()
        thumbnail.write_bytes(image_bytes(0)); first["thumbnailSha256"]=hashlib.sha256(thumbnail.read_bytes()).hexdigest(); libraryfile.write_text(json.dumps(library))
        with self.assertRaisesRegex(ValueError,"visible PNG"): IMPORTER.publish(self.staging,self.project,self.base/"backups")
        thumbnail.write_bytes(original); first["thumbnailSha256"]=hashlib.sha256(original).hexdigest(); libraryfile.write_text(json.dumps(library))
        target=self.staging/(IMPORTER.BASE+"/fly1/fly1.json"); target.write_bytes(target.read_bytes()+b" ")
        with self.assertRaisesRegex(ValueError,"runtime input changed"): IMPORTER.publish(self.staging,self.project,self.base/"backups")
        self.assertEqual(self.catalog.read_bytes(),self.before)

    def test_manual_edits_and_concurrent_catalog_changes_are_preserved(self):
        self.prepare(); self.bake(); IMPORTER.publish(self.staging,self.project,self.base/"backups")
        image=self.project/(IMPORTER.BASE+"/fly1/fly1.png"); image.write_bytes(image.read_bytes()+b"manual")
        with self.assertRaisesRegex(ValueError,"edited"): IMPORTER.publish(self.staging,self.project,self.base/"backups")
        self.assertTrue(image.read_bytes().endswith(b"manual"))

    def test_centering_uses_verified_measurements_and_changes_only_derived_root_tracks(self):
        self.prepare(); original=json.loads((self.staging/IMPORTER.LIBRARY).read_text())
        report=dict(ok=True,errors=[],preparedLibrarySha256=hashlib.sha256((self.staging/IMPORTER.LIBRARY).read_bytes()).hexdigest(),runtimeJsonSha256={},entries=[])
        for i in range(1,7):
            relative=IMPORTER.BASE+"/fly{0}/fly{0}.json".format(i)
            report["runtimeJsonSha256"][relative]=hashlib.sha256((self.staging/relative).read_bytes()).hexdigest()
        for row in original["assets"]: report["entries"].append(dict(id=row["id"],resource=row["resource"],animation=row["animation"],duration=row["duration"],nativeBounds=dict(x=10,y=-5,width=40,height=20)))
        receipt=self.base/"measurements.json"; receipt.write_text(json.dumps(report))
        centered=self.base/"centered"
        IMPORTER.prepare(self.source,centered,self.project,fake_loops,bounds=receipt)
        output=json.loads((centered/(IMPORTER.BASE+"/fly1/fly1.json")).read_text())
        self.assertEqual(output["animations"]["flight_loop_fly_1"]["bones"]["root"]["translate"][0],{"x":-30,"y":-5})
        self.assertEqual(output["animations"]["fly_1"],json.loads((self.source/"Effects/fly1/fly1.json").read_text())["animations"]["fly_1"])
        library=json.loads((centered/IMPORTER.LIBRARY).read_text()); self.assertIn("centering",library["source"])
        report["runtimeJsonSha256"][IMPORTER.BASE+"/fly1/fly1.json"]="0"*64; receipt.write_text(json.dumps(report))
        with self.assertRaisesRegex(ValueError,"different runtime data"):
            IMPORTER.prepare(self.source,self.base/"bad-center",self.project,fake_loops,bounds=receipt)
        self.assertEqual(self.catalog.read_bytes(),self.before)

    def test_publication_detects_concurrent_change_before_any_asset_is_written(self):
        self.prepare(); self.bake()
        original = IMPORTER.Transaction.commit
        changed = self.before.replace(b'"old"', b'"other"')
        def race(tx):
            self.catalog.write_bytes(changed)
            return original(tx)
        with patch.object(IMPORTER.Transaction, "commit", race):
            with self.assertRaisesRegex(ValueError, "Concurrent change"):
                IMPORTER.publish(self.staging,self.project,self.base/"backups")
        self.assertEqual(self.catalog.read_bytes(),changed)
        self.assertFalse((self.project/IMPORTER.LIBRARY).exists())

    def test_unknown_catalog_and_library_extensions_survive_idempotent_reimport(self):
        self.prepare(); self.bake(); IMPORTER.publish(self.staging,self.project,self.base/"backups")
        file=self.project/IMPORTER.LIBRARY; library=json.loads(file.read_text()); library["future"]={"preserve":42}; library["assets"][0]["extension"]="keep"; file.write_text(json.dumps(library))
        catalog=json.loads(self.catalog.read_text()); catalog["assets"][1]["extension"]="keep"; catalog["source"]["spineProjectiles"]["future"]="keep"; self.catalog.write_text(json.dumps(catalog)); before=self.catalog.read_bytes()
        IMPORTER.publish(self.staging,self.project,self.base/"backups")
        self.assertEqual(self.catalog.read_bytes(),before)
        after=json.loads(file.read_text()); self.assertEqual(after["future"],{"preserve":42}); self.assertEqual(after["assets"][0]["extension"],"keep")

    def test_extra_staged_files_and_outside_paths_are_rejected_before_publication(self):
        self.prepare(); self.bake(); planfile=self.staging/"stage.json"; prepared=json.loads(planfile.read_text())
        prepared["files"]["../outside.json"]="0"*64; planfile.write_text(json.dumps(prepared))
        with self.assertRaisesRegex(ValueError,"file list changed"):
            IMPORTER.publish(self.staging,self.project,self.base/"backups")
        with self.assertRaisesRegex(ValueError,"Unsafe"):
            IMPORTER.staged_file(self.staging,IMPORTER.BASE+"/../../outside.png")
        self.assertEqual(self.catalog.read_bytes(),self.before)

    def test_rejects_unsafe_staging_in_project_and_missing_collection_variants(self):
        with self.assertRaisesRegex(ValueError,"outside"): IMPORTER.prepare(self.source,self.project/"staging",self.project,fake_loops)
        file=self.source/"source-manifest.json"; data=json.loads(file.read_text()); data["ready_clips"].pop(); file.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,"67 visible"): self.prepare()

if __name__ == "__main__": unittest.main()
