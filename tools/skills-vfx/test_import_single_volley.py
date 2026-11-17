"""Pure source slicing must preserve the old source and final-set topology."""
import copy, importlib.util, json
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('single_volley',Path(__file__).with_name('import-single-volley.py'))
single=importlib.util.module_from_spec(spec);spec.loader.exec_module(single)

class SingleVolleyTests(unittest.TestCase):
    def test_crop_is_deterministic_and_does_not_change_original_data(self):
        source=json.loads((single.ROOT/single.SOURCE).read_bytes());before=copy.deepcopy(source)
        derived,paths,selected,arrows=single.crop(source)
        self.assertEqual(source,before);self.assertEqual(single.crop(source)[0],derived)
        self.assertEqual(len(selected),5);self.assertEqual(len(arrows),3)
        self.assertEqual({row['name'] for row in derived['slots']},set(selected))
        self.assertEqual(set(derived['animations']),{'single_volley'})
        self.assertTrue(all(row['volley']==2 for row in paths['trajectories'] if row['slot'] in arrows))
        for timeline in derived['animations']['single_volley']['slots'].values():
            self.assertEqual(timeline['attachment'][0]['time'],0)
            self.assertTrue(all(0<=row['time']<=single.END-single.START for values in timeline.values() for row in values))

if __name__=='__main__':unittest.main()
