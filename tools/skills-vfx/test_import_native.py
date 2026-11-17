"""Collection refresh must not discard independently imported native effects."""
import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('native_vfx', Path(__file__).with_name('import-native.py'))
native = importlib.util.module_from_spec(spec); spec.loader.exec_module(native)

class NativeMergeTests(unittest.TestCase):
    def test_managed_updates_replace_only_their_own_ids(self):
        previous = [dict(id='managed', duration=1), dict(id='sp162-custom', unknown={'preserved': True})]
        fresh = [dict(id='managed', duration=2)]
        self.assertEqual(native.preserve_supplemental(fresh, previous), [fresh[0], previous[1]])
        self.assertEqual(previous[0]['duration'], 1)
        self.assertEqual(len(fresh), 1)

    def test_duplicate_independent_ids_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate native'):
            native.preserve_supplemental([dict(id='base')], [dict(id='extra'), dict(id='extra')])

if __name__ == '__main__': unittest.main()
