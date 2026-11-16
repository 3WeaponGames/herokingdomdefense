"""Importer validation uses temporary external manifests, never production writes."""
import copy, importlib.util, json, tempfile, unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('weather_importer',Path(__file__).with_name('import-weather-bake.py'))
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)

class WeatherImportTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='hkd-weather-import-')
        self.root=Path(self.temp.name); (self.root/'Baked').mkdir()
        self.selection=json.loads(Path(__file__).with_name('weather-effects.json').read_text())['clips']
        self.jobs=[dict(c,cell=128,columns=16) for c in self.selection]
        self.rows=[dict(c,file=c['id']+'.png',anchorX=.5,anchorY=.5,aspect=1,visibleFrames=64,alphaBounds=[0,0,127,127]) for c in self.jobs]
        self.write()
    def tearDown(self): self.temp.cleanup()
    def write(self):
        (self.root/'jobs.json').write_text(json.dumps({'clips':self.jobs}))
        (self.root/'Baked/clips.json').write_text(json.dumps({'clips':self.rows}))
        (self.root/'source.json').write_text(json.dumps({'workbookSha256':'a'*64}))
    def test_combined_capture_publishes_only_complete_weather_subset(self):
        self.jobs.append({'id':'other-hero-vfx'}); self.rows.append({'id':'other-hero-vfx'}); self.write()
        rows,source=module.capture_rows(self.root)
        self.assertEqual(len(rows),8); self.assertTrue(all(r['id'].startswith('weather-') for r in rows))
    def test_rejects_missing_duplicate_mismatched_unsafe_empty_and_invalid_layouts(self):
        original=copy.deepcopy(self.rows)
        variants=[]
        variants.append(original[:-1]);variants.append(original+[original[0]])
        for field,value in [('prefab','another.prefab'),('file','../escape.png'),('visibleFrames',0),('alphaBounds',[0,0,400,127]),('columns',100),('fps',False),('anchorX',float('nan'))]:
            altered=copy.deepcopy(original); altered[0][field]=value; variants.append(altered)
        for invalid in variants:
            with self.subTest(invalid=invalid[0]):
                self.rows=invalid;self.write()
                with self.assertRaises(ValueError): module.capture_rows(self.root)

if __name__=='__main__': unittest.main()
