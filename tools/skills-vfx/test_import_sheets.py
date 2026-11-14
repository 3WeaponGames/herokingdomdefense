"""Asset conversion checks without launching an editor or touching game data."""
import importlib.util
from pathlib import Path
import unittest
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location('guardian_sheets', Path(__file__).with_name('import-sheets.py'))
sheets = importlib.util.module_from_spec(spec); spec.loader.exec_module(sheets)

class WhiteMatteTests(unittest.TestCase):
    def test_white_background_is_transparent_and_enclosed_highlight_survives(self):
        image=Image.new('RGB',(32,32),'white'); draw=ImageDraw.Draw(image)
        draw.rectangle((8,8,23,23),fill=(80,40,230));draw.rectangle((12,12,19,19),fill='white')
        result=sheets.unmatte(image)
        self.assertEqual(result.getpixel((0,0)),(0,0,0,0))
        self.assertEqual(result.getpixel((16,16)),(255,255,255,255))
        self.assertGreater(result.getpixel((9,9))[3],0)

    def test_eye_core_preserves_white_ink_without_an_opaque_cell_background(self):
        image=Image.new('RGB',(272,364),'white')
        result=sheets.unmatte(image,(136,134,34))
        self.assertEqual(result.getpixel((136,134)),(255,255,255,255))
        self.assertEqual(result.getpixel((0,0)),(0,0,0,0))

    def test_soft_colored_glow_keeps_a_soft_alpha_instead_of_an_opaque_rectangle(self):
        image=Image.new('RGB',(32,32),'white');image.putpixel((16,16),(245,240,255))
        result=sheets.unmatte(image)
        self.assertEqual(result.getpixel((0,0))[3],0)
        self.assertGreater(result.getpixel((16,16))[3],0)
        self.assertLess(result.getpixel((16,16))[3],30)

if __name__=='__main__':unittest.main()
